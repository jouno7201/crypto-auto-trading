import { useState, useEffect, useCallback, useRef } from 'react';
import StatCard from './StatCard';
import CandleChart from './CandleChart';
import BotPanel from './BotPanel';
import TradeTable from './TradeTable';
import ConfirmDialog from './ConfirmDialog';
import StrategyEditor from './StrategyEditor';
import { api } from '../hooks/useApi';
import { fmtNum, fmtPct, pnlClass, CHART_UNITS, MARKETS } from '../utils';

export default function TradingTab({ ticker, botStatus, wsSend, toast }) {
  const [config, setConfig] = useState({ market: 'KRW-BTC', strategy: 'ensemble', unit: '60' });
  const [chartUnit, setChartUnit] = useState('60');
  const [candles, setCandles] = useState([]);
  const [trades, setTrades] = useState([]);
  const [tradeTotal, setTradeTotal] = useState(0);
  const [tradePage, setTradePage] = useState(1);
  const [tradeFilter, setTradeFilter] = useState({ market: '', type: '' });
  const [confirm, setConfirm] = useState(null);
  const configSynced = useRef(false);
  const TRADE_LIMIT = 20;

  // Sync config from server on mount
  useEffect(() => {
    (async () => {
      const res = await api('/api/assets/bot');
      if (!res || !res.ok) return;
      const data = await res.json();
      if (data.market && data.strategyName) {
        setConfig({ market: data.market, strategy: data.strategyName, unit: data.unit || '60' });
        setChartUnit(data.unit || '60');
        configSynced.current = true;
      }
    })();
  }, []);

  // Sync config when botStatus arrives via WS (only first meaningful update)
  useEffect(() => {
    if (configSynced.current || !botStatus?.market || !botStatus?.strategyName) return;
    setConfig({ market: botStatus.market, strategy: botStatus.strategyName, unit: botStatus.unit || '60' });
    setChartUnit(botStatus.unit || '60');
    configSynced.current = true;
  }, [botStatus?.market, botStatus?.strategyName, botStatus?.unit]);

  const loadCandles = useCallback(async () => {
    const res = await api(`/api/assets/candles/${encodeURIComponent(config.market)}?unit=${chartUnit}&count=200`);
    if (!res || !res.ok) return;
    const data = await res.json();
    setCandles(Array.isArray(data) ? data : data.candles || []);
  }, [config.market, chartUnit]);

  const loadTrades = useCallback(async () => {
    const params = new URLSearchParams({ limit: TRADE_LIMIT, page: tradePage });
    if (tradeFilter.market) params.set('market', tradeFilter.market);
    if (tradeFilter.type) params.set('type', tradeFilter.type);
    const res = await api(`/api/trades?${params}`);
    if (!res || !res.ok) return;
    const data = await res.json();
    if (data.rows) {
      setTrades(data.rows);
      setTradeTotal(data.total || 0);
    } else {
      const arr = data.trades || data || [];
      setTrades(arr);
      setTradeTotal(arr.length);
    }
  }, [tradePage, tradeFilter.market, tradeFilter.type]);

  useEffect(() => {
    loadCandles();
  }, [loadCandles]);
  useEffect(() => {
    loadTrades();
    const timer = setInterval(loadTrades, 30000);
    return () => clearInterval(timer);
  }, [loadTrades]);

  // Update last candle with live ticker
  useEffect(() => {
    if (!ticker?.price || !candles.length) return;
    setCandles((prev) => {
      const last = { ...prev[prev.length - 1] };
      last.close = ticker.price;
      if (ticker.price > last.high) last.high = ticker.price;
      if (ticker.price < last.low) last.low = ticker.price;
      return [...prev.slice(0, -1), last];
    });
  }, [ticker?.price]);

  const applyConfig = () => {
    wsSend('configBot', { market: config.market, strategyName: config.strategy, unit: config.unit });
    loadCandles();
  };

  const handleStart = () => {
    setConfirm({
      message: `${config.market} / ${config.strategy} 봇을 시작하시겠습니까?`,
      onConfirm: () => {
        wsSend('startBot');
        setConfirm(null);
      },
    });
  };

  const handleStop = () => {
    wsSend('stopBot');
  };

  const price = ticker?.price;
  const pctChange = ticker?.change ? (ticker.change * 100).toFixed(2) : null;

  return (
    <>
      <div className="cards">
        <StatCard
          label="현재가"
          value={price ? `${fmtNum(price)}원` : '-'}
          sub={pctChange != null ? `${pctChange > 0 ? '+' : ''}${pctChange}%` : '-'}
          valueClass=""
        />
        <StatCard
          label="수익률"
          value={fmtPct(botStatus?.totalReturn)}
          sub={`승률 ${botStatus?.winRate != null ? botStatus.winRate.toFixed(1) + '%' : '-'}`}
          valueClass={pnlClass(botStatus?.totalReturn)}
        />
        <StatCard label="거래 수" value={botStatus?.tradeCount || 0} sub={`오늘 ${botStatus?.todayCount || 0}건`} />
        <StatCard
          label="봇 상태"
          value={botStatus?.running ? '실행 중' : '정지'}
          sub={`${botStatus?.market || '-'} / ${botStatus?.strategyName || '-'}`}
          valueClass={botStatus?.running ? 'pos' : ''}
        />
      </div>

      <div className="main">
        <div className="chart-box">
          <div className="chart-hdr">
            <h2>{config.market}</h2>
            <select className="sm-sel" value={chartUnit} onChange={(e) => setChartUnit(e.target.value)}>
              {CHART_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <CandleChart candles={candles} trades={trades} />
          {!candles.length && <div className="skeleton skeleton-chart" />}
        </div>

        <div className="side">
          <BotPanel
            config={config}
            setConfig={setConfig}
            onApply={applyConfig}
            onStart={handleStart}
            onStop={handleStop}
            botRunning={botStatus?.running}
          />
          <StrategyEditor toast={toast} />
          <div className="sec">
            <h3>거래 내역</h3>
            <div className="filter-bar">
              <select
                value={tradeFilter.market}
                onChange={(e) => {
                  setTradeFilter((p) => ({ ...p, market: e.target.value }));
                  setTradePage(1);
                }}
              >
                <option value="">전체 마켓</option>
                {MARKETS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={tradeFilter.type}
                onChange={(e) => {
                  setTradeFilter((p) => ({ ...p, type: e.target.value }));
                  setTradePage(1);
                }}
              >
                <option value="">전체 타입</option>
                <option value="buy">매수</option>
                <option value="sell">매도</option>
              </select>
            </div>
            <div className="scroll-y">
              <TradeTable trades={trades} />
            </div>
            {tradeTotal > TRADE_LIMIT && (
              <div className="pagination">
                <button
                  className="btn btn-outline btn-xs"
                  disabled={tradePage <= 1}
                  onClick={() => setTradePage((p) => p - 1)}
                >
                  ◀ 이전
                </button>
                <span>
                  {tradePage} / {Math.ceil(tradeTotal / TRADE_LIMIT)}
                </span>
                <button
                  className="btn btn-outline btn-xs"
                  disabled={tradePage >= Math.ceil(tradeTotal / TRADE_LIMIT)}
                  onClick={() => setTradePage((p) => p + 1)}
                >
                  다음 ▶
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}
