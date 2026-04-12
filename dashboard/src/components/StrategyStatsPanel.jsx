import { useState, useEffect, useCallback } from 'react';
import { api } from '../hooks/useApi';
import { fmtNum, pnlClass } from '../utils';

export default function StrategyStatsPanel({ toast }) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/api/strategies/stats');
      if (!res || !res.ok) return;
      setStats(await res.json());
    } catch (e) {
      toast('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="empty">로딩 중...</div>;
  if (!stats.length) return <div className="empty">아직 실전 거래 기록이 없습니다</div>;

  const best = stats.reduce((a, b) => (a.totalPnl > b.totalPnl ? a : b));

  return (
    <div className="sec">
      <div className="sec-hdr">
        <h3>전략 실전 성과</h3>
        <button className="btn btn-outline btn-xs" onClick={load}>
          새로고침
        </button>
      </div>
      <div className="scroll-y">
        <table>
          <thead>
            <tr>
              <th>전략</th>
              <th>마켓</th>
              <th>거래 수</th>
              <th>승률</th>
              <th>총 PnL</th>
              <th>평균 PnL</th>
              <th>최대 수익</th>
              <th>최대 손실</th>
              <th>최종 갱신</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={`${s.strategy}-${s.market}`} className={s === best ? 'row-highlight' : ''}>
                <td>
                  <strong>{s.strategy}</strong>
                </td>
                <td>{s.market}</td>
                <td>{s.totalTrades}</td>
                <td>{(s.winRate * 100).toFixed(1)}%</td>
                <td className={pnlClass(s.totalPnl)}>{fmtNum(s.totalPnl)}</td>
                <td className={pnlClass(s.avgPnl)}>{fmtNum(s.avgPnl)}</td>
                <td className="pos">{fmtNum(s.maxWin)}</td>
                <td className="neg">{fmtNum(s.maxLoss)}</td>
                <td>{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString('ko') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
