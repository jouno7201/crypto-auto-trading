import { useState, useEffect, useCallback } from 'react';
import { api, postJson } from '../hooks/useApi';
import { MARKETS, STRATEGIES, UNITS } from '../utils';

export default function MultiBotTab({ toast }) {
  const [bots, setBots] = useState({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ market: 'KRW-ETH', strategyName: 'ensemble', unit: '60' });

  const load = useCallback(async () => {
    const res = await api('/api/assets/bots');
    if (!res || !res.ok) return;
    const data = await res.json();
    setBots(data.bots ? {} : data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const addBot = async () => {
    const res = await postJson('/api/assets/bots/add', form);
    if (!res || !res.ok) {
      const err = await res?.json?.().catch(() => ({}));
      toast('error', err?.error || '봇 추가 실패');
      return;
    }
    toast('ok', `${form.market} 봇 추가 완료`);
    setAdding(false);
    load();
  };

  const removeBot = async (market) => {
    const res = await api(`/api/assets/bots/${encodeURIComponent(market)}`, { method: 'DELETE' });
    if (!res || !res.ok) {
      toast('error', '봇 제거 실패');
      return;
    }
    toast('ok', `${market} 봇 제거됨`);
    load();
  };

  const startBot = async (market) => {
    const res = await postJson(`/api/assets/bots/${encodeURIComponent(market)}/start`, {});
    if (!res || !res.ok) {
      toast('error', '봇 시작 실패');
      return;
    }
    toast('ok', `${market} 봇 시작`);
    load();
  };

  const stopBot = async (market) => {
    const res = await postJson(`/api/assets/bots/${encodeURIComponent(market)}/stop`, {});
    if (!res || !res.ok) {
      toast('error', '봇 정지 실패');
      return;
    }
    toast('ok', `${market} 봇 정지`);
    load();
  };

  const startAll = async () => {
    await postJson('/api/assets/bots/start-all', {});
    toast('ok', '전체 봇 시작');
    load();
  };

  const stopAll = async () => {
    await postJson('/api/assets/bots/stop-all', {});
    toast('ok', '전체 봇 정지');
    load();
  };

  const entries = Object.entries(bots);

  return (
    <div className="tab-content">
      <div className="sec-hdr">
        <h3>멀티봇 관리</h3>
        <div className="btn-grp" style={{ margin: 0 }}>
          <button className="btn btn-go btn-xs" onClick={startAll} disabled={!entries.length}>
            ▶ 전체 시작
          </button>
          <button className="btn btn-stop btn-xs" onClick={stopAll} disabled={!entries.length}>
            ⏹ 전체 정지
          </button>
          <button className="btn btn-pri btn-xs" onClick={() => setAdding(!adding)}>
            + 봇 추가
          </button>
        </div>
      </div>

      {adding && (
        <div className="fg" style={{ marginBottom: 14 }}>
          <label>
            마켓
            <select value={form.market} onChange={(e) => setForm((p) => ({ ...p, market: e.target.value }))}>
              {MARKETS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            전략
            <select
              value={form.strategyName}
              onChange={(e) => setForm((p) => ({ ...p, strategyName: e.target.value }))}
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            봉 단위
            <select value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            <div className="btn-grp" style={{ margin: 0 }}>
              <button className="btn btn-pri btn-xs" onClick={addBot}>
                추가
              </button>
              <button className="btn btn-outline btn-xs" onClick={() => setAdding(false)}>
                취소
              </button>
            </div>
          </label>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="empty">등록된 봇이 없습니다. 위의 "봇 추가" 버튼으로 봇을 등록하세요.</div>
      ) : (
        <div className="bot-grid">
          {entries.map(([market, bot]) => (
            <div key={market} className={`bot-card${bot.running ? ' bot-active' : ''}`}>
              <div className="bot-card-hdr">
                <span className="bot-market">{market}</span>
                <span className={`bot-status ${bot.running ? 'pos' : ''}`}>{bot.running ? '실행 중' : '정지'}</span>
              </div>
              <div className="bot-card-body">
                <div className="bot-info">
                  <span>전략</span>
                  <span>{bot.strategy || bot.strategyName || '-'}</span>
                </div>
                <div className="bot-info">
                  <span>봉</span>
                  <span>{bot.unit || '-'}분</span>
                </div>
                <div className="bot-info">
                  <span>모드</span>
                  <span>{bot.mode || 'paper'}</span>
                </div>
                <div className="bot-info">
                  <span>거래</span>
                  <span>{bot.tradeCount || 0}건</span>
                </div>
              </div>
              <div className="btn-grp" style={{ margin: 0 }}>
                {!bot.running ? (
                  <button className="btn btn-go btn-xs" onClick={() => startBot(market)}>
                    ▶ 시작
                  </button>
                ) : (
                  <button className="btn btn-stop btn-xs" onClick={() => stopBot(market)}>
                    ⏹ 정지
                  </button>
                )}
                <button className="btn btn-outline btn-xs" onClick={() => removeBot(market)} disabled={bot.running}>
                  ✕ 제거
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
