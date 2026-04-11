import { useState, useEffect, useCallback } from 'react';
import { api, postJson } from '../hooks/useApi';
import { MARKETS, STRATEGIES, UNITS, fmtPct, fmtDate, pnlClass } from '../utils';

export default function BacktestTab({ toast }) {
  // Backtest form
  const [bt, setBt] = useState({
    market: 'KRW-BTC',
    strategy: 'ma-cross',
    unit: '60',
    count: 500,
    capital: 1000000,
    fee: 0.05,
  });
  const [btResult, setBtResult] = useState(null);
  const [btLoading, setBtLoading] = useState(false);

  // Walk-forward form
  const [wf, setWf] = useState({ train: 70, folds: 4 });
  const [wfStart, setWfStart] = useState('');
  const [wfEnd, setWfEnd] = useState('');
  const [wfResult, setWfResult] = useState(null);
  const [wfLoading, setWfLoading] = useState(false);

  // History
  const [history, setHistory] = useState([]);

  // Default dates
  useEffect(() => {
    const now = new Date();
    setWfEnd(now.toISOString().slice(0, 10));
    setWfStart(new Date(now - 90 * 86400000).toISOString().slice(0, 10));
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await api('/api/assets/backtest');
    if (!res || !res.ok) return;
    const data = await res.json();
    setHistory((data.results || data || []).slice(0, 20));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const runBacktest = async () => {
    setBtLoading(true);
    setBtResult(null);
    try {
      const res = await postJson('/api/assets/backtest/run', {
        market: bt.market,
        strategy: bt.strategy,
        unit: bt.unit,
        count: parseInt(bt.count),
        capital: parseInt(bt.capital),
        feeRate: parseFloat(bt.fee) / 100,
      });
      if (!res || !res.ok) {
        toast('error', '백테스트 실패');
        return;
      }
      const d = await res.json();
      setBtResult(d);
      toast('ok', '백테스트 완료 — 2단계 워크포워드를 실행하세요');
    } catch (e) {
      toast('error', e.message);
    } finally {
      setBtLoading(false);
    }
  };

  const runWalkForward = async () => {
    if (!wfStart || !wfEnd) {
      toast('warning', '시작일/종료일을 입력하세요');
      return;
    }
    setWfLoading(true);
    setWfResult(null);
    try {
      const res = await postJson('/api/assets/backtest/walk-forward', {
        market: bt.market,
        strategy: bt.strategy,
        unit: bt.unit,
        startDate: wfStart,
        endDate: wfEnd,
        capital: parseInt(bt.capital),
        trainRatio: parseInt(wf.train) / 100,
        windows: parseInt(wf.folds),
      });
      if (!res || !res.ok) {
        const err = await res?.json?.().catch(() => ({}));
        toast('error', err?.error || '워크포워드 실패');
        return;
      }
      const d = await res.json();
      setWfResult(d);
      toast('ok', '워크포워드 검증 완료');
      loadHistory();
    } catch (e) {
      toast('error', e.message);
    } finally {
      setWfLoading(false);
    }
  };

  return (
    <div className="tab-content">
      <div className="sec-hdr">
        <h3>전략 검증 (백테스트 → 워크포워드)</h3>
      </div>

      {/* Step 1: Backtest */}
      <div>
        <div className="fg">
          <label>
            마켓
            <select value={bt.market} onChange={(e) => setBt((p) => ({ ...p, market: e.target.value }))}>
              {MARKETS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            전략
            <select value={bt.strategy} onChange={(e) => setBt((p) => ({ ...p, strategy: e.target.value }))}>
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            봉 단위
            <select value={bt.unit} onChange={(e) => setBt((p) => ({ ...p, unit: e.target.value }))}>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            캔들 수
            <input
              type="number"
              value={bt.count}
              min={50}
              max={2000}
              onChange={(e) => setBt((p) => ({ ...p, count: e.target.value }))}
            />
          </label>
          <label>
            초기자본
            <input
              type="number"
              value={bt.capital}
              step={100000}
              onChange={(e) => setBt((p) => ({ ...p, capital: e.target.value }))}
            />
          </label>
          <label>
            수수료(%)
            <input
              type="number"
              value={bt.fee}
              step={0.01}
              onChange={(e) => setBt((p) => ({ ...p, fee: e.target.value }))}
            />
          </label>
          <label className="full">
            <button className="btn btn-pri" onClick={runBacktest} disabled={btLoading}>
              {btLoading && <span className="spinner" />}
              {btLoading ? '실행 중...' : '1단계: 백테스트 실행'}
            </button>
          </label>
        </div>

        {btResult && <BacktestResult data={btResult} />}
      </div>

      {/* Step 2: Walk-Forward */}
      <div>
        <div className="fg">
          <label>
            시작일 <input type="date" value={wfStart} onChange={(e) => setWfStart(e.target.value)} />
          </label>
          <label>
            종료일 <input type="date" value={wfEnd} onChange={(e) => setWfEnd(e.target.value)} />
          </label>
          <label>
            훈련 비율(%)
            <input
              type="number"
              value={wf.train}
              min={50}
              max={90}
              onChange={(e) => setWf((p) => ({ ...p, train: e.target.value }))}
            />
          </label>
          <label>
            윈도우 수
            <input
              type="number"
              value={wf.folds}
              min={2}
              max={10}
              onChange={(e) => setWf((p) => ({ ...p, folds: e.target.value }))}
            />
          </label>
          <label className="full">
            <button className="btn btn-pri" onClick={runWalkForward} disabled={wfLoading}>
              {wfLoading && <span className="spinner" />}
              {wfLoading ? '실행 중...' : '2단계: 워크포워드 검증'}
            </button>
          </label>
        </div>

        {wfResult && <WalkForwardResult data={wfResult} />}
      </div>

      {/* History */}
      <div>
        <div className="sec">
          <h3>검증 히스토리</h3>
          <div className="scroll-y">
            {history.length === 0 ? (
              <div className="empty">검증 기록이 없습니다</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>일시</th>
                    <th>마켓</th>
                    <th>전략</th>
                    <th>수익률</th>
                    <th>승률</th>
                    <th>MDD</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r, i) => {
                    const dateStr = r.period?.start || r.file?.replace(/.*_(\d+)\.json/, '$1') || '-';
                    return (
                      <tr key={i}>
                        <td>{dateStr}</td>
                        <td>{r.period?.market || '-'}</td>
                        <td>{r.strategy || '-'}</td>
                        <td className={pnlClass(r.totalReturn)}>{fmtPct(r.totalReturn)}</td>
                        <td>{r.winRate != null ? `${(r.winRate * 100).toFixed(1)}%` : '-'}</td>
                        <td className="neg">{((r.maxDrawdown || 0) * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BacktestResult({ data }) {
  const perf = data.performance || {};
  const tr = data.trades || {};
  return (
    <div className="res-box">
      <h4>백테스트 결과</h4>
      <Metric label="총 수익률" value={fmtPct(perf.totalReturn)} cls={pnlClass(perf.totalReturn)} />
      <Metric label="거래 수" value={tr.total || 0} />
      <Metric label="승률" value={`${((tr.winRate || 0) * 100).toFixed(1)}%`} />
      <Metric label="샤프 비율" value={(perf.sharpeRatio || 0).toFixed(2)} />
      <Metric label="MDD" value={`${((perf.maxDrawdown || 0) * 100).toFixed(2)}%`} cls="neg" />
      <Metric label="Profit Factor" value={(perf.profitFactor || 0).toFixed(2)} />
    </div>
  );
}

function WalkForwardResult({ data }) {
  const oos = data.oos || {};
  const analysis = data.analysis || {};
  return (
    <div className="res-box">
      <h4>워크포워드 검증 결과</h4>
      <Metric label="평균 OOS 수익률" value={fmtPct(oos.avgReturn)} cls={pnlClass(oos.avgReturn)} />
      <Metric label="체인 수익률" value={fmtPct(oos.totalChainedReturn)} />
      <Metric label="평균 샤프" value={(oos.avgSharpe || 0).toFixed(2)} />
      <Metric label="강건성" value={`${((analysis.robustnessRatio || 0) * 100).toFixed(0)}%`} />
      <Metric label="일관성" value={`${((analysis.consistencyRatio || 0) * 100).toFixed(0)}%`} />
      <Metric label="판정" value={analysis.verdict || '-'} />
      {data.windowDetails && (
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>윈도우</th>
              <th>Train 캔들</th>
              <th>Test 캔들</th>
              <th>OOS 수익률</th>
            </tr>
          </thead>
          <tbody>
            {data.windowDetails.map((w) => (
              <tr key={w.window}>
                <td>#{w.window}</td>
                <td>{w.period?.train?.candles || '-'}</td>
                <td>{w.period?.test?.candles || '-'}</td>
                <td className={pnlClass(w.test?.totalReturn)}>{fmtPct(w.test?.totalReturn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Metric({ label, value, cls }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <span className={cls || ''}>{value}</span>
    </div>
  );
}
