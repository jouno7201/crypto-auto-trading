import { useState, useEffect, useCallback } from 'react';
import { api, postJson } from '../hooks/useApi';
import { fmtNum, fmtDate } from '../utils';
import StrategyStatsPanel from './StrategyStatsPanel';

export default function ReportsTab({ toast }) {
  const [summary, setSummary] = useState({});
  const [reports, setReports] = useState([]);
  const [detail, setDetail] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [period, setPeriod] = useState('daily');

  const loadSummary = useCallback(async () => {
    const res = await api('/api/trades/stats');
    if (!res || !res.ok) return;
    setSummary(await res.json());
  }, []);

  const loadList = useCallback(async () => {
    const res = await api('/api/reports');
    if (!res || !res.ok) return;
    const data = await res.json();
    setReports(data.reports || data || []);
  }, []);

  useEffect(() => {
    loadSummary();
    loadList();
  }, [loadSummary, loadList]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await postJson('/api/reports/generate', { period });
      if (!res || !res.ok) {
        toast('error', '리포트 생성 실패');
        return;
      }
      toast('ok', '리포트 생성 완료');
      loadList();
    } catch (e) {
      toast('error', e.message);
    } finally {
      setGenerating(false);
    }
  };

  const viewReport = async (file) => {
    const res = await api(`/api/reports/${encodeURIComponent(file)}`);
    if (!res || !res.ok) return;
    const d = await res.json();
    setDetail({ file, ...d });
  };

  const winRate = summary.totalTrades > 0 ? (((summary.wins || 0) / summary.totalTrades) * 100).toFixed(1) : '0.0';

  return (
    <div className="tab-content">
      <div className="sec-hdr">
        <h3>리포트</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="period-sel">
            {[
              ['daily', '일간'],
              ['weekly', '주간'],
              ['monthly', '월간'],
            ].map(([v, l]) => (
              <button key={v} className={period === v ? 'active' : ''} onClick={() => setPeriod(v)}>
                {l}
              </button>
            ))}
          </div>
          <button className="btn btn-go" onClick={generate} disabled={generating}>
            {generating && <span className="spinner" />}
            📊 생성
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="cards" style={{ padding: 0, marginBottom: 14 }}>
        <div className="card">
          <div className="card-lbl">총 거래</div>
          <div className="card-val">{summary.totalTrades || '-'}</div>
        </div>
        <div className="card">
          <div className="card-lbl">승률</div>
          <div className="card-val">{winRate}%</div>
        </div>
        <div className="card">
          <div className="card-lbl">총 수익</div>
          <div className="card-val">{fmtNum(summary.totalPnl)}</div>
        </div>
        <div className="card">
          <div className="card-lbl">평균 수익</div>
          <div className="card-val">{fmtNum(summary.avgPnl)}</div>
        </div>
      </div>

      {/* Report list */}
      <div className="sec">
        <h3>생성된 리포트</h3>
        <div className="scroll-y">
          {reports.length === 0 ? (
            <div className="empty">생성된 리포트가 없습니다</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>파일</th>
                  <th>생성일</th>
                  <th>다운로드</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          viewReport(r.file);
                        }}
                      >
                        {r.file}
                      </a>
                    </td>
                    <td>{fmtDate(r.generatedAt)}</td>
                    <td>
                      <a href={`/api/reports/${encodeURIComponent(r.file)}/csv`} download>
                        CSV
                      </a>{' '}
                      <a href={`/api/reports/${encodeURIComponent(r.file)}/pdf`} download>
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail */}
      {detail && (
        <div className="res-box">
          <h4>{detail.file}</h4>
          {detail.summary && (
            <>
              <div className="metric">
                <span>총 거래</span>
                <span>{detail.summary.totalTrades || 0}</span>
              </div>
              <div className="metric">
                <span>총 수익</span>
                <span>{fmtNum(detail.summary.totalPnl)}</span>
              </div>
              <div className="metric">
                <span>승률</span>
                <span>{((detail.summary.winRate || 0) * 100).toFixed(1)}%</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* 전략별 실전 성과 */}
      <StrategyStatsPanel toast={toast} />
    </div>
  );
}
