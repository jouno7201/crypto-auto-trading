import { useState, useEffect, useCallback } from 'react';
import { api } from '../hooks/useApi';

export default function StrategyEditor({ toast }) {
  const [strategies, setStrategies] = useState([]);
  const [editing, setEditing] = useState(null); // strategy id
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api('/api/strategies');
    if (!res || !res.ok) return;
    setStrategies(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (strat) => {
    setEditing(strat.id);
    setDraft({ ...strat.params });
  };

  const cancel = () => {
    setEditing(null);
    setDraft({});
  };

  const save = async (id) => {
    // 프론트엔드 기본 검증
    for (const [key, val] of Object.entries(draft)) {
      if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
        toast('error', `${key}: 0보다 큰 유한한 숫자여야 합니다`);
        return;
      }
    }
    if (draft.shortPeriod != null && draft.longPeriod != null && draft.shortPeriod >= draft.longPeriod) {
      toast('error', 'shortPeriod는 longPeriod보다 작아야 합니다');
      return;
    }
    if (draft.fastPeriod != null && draft.slowPeriod != null && draft.fastPeriod >= draft.slowPeriod) {
      toast('error', 'fastPeriod는 slowPeriod보다 작아야 합니다');
      return;
    }

    setSaving(true);
    try {
      const res = await api(`/api/strategies/${encodeURIComponent(id)}/params`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res || !res.ok) {
        const err = res ? await res.json().catch(() => ({})) : {};
        toast('error', err.error || '파라미터 저장 실패');
        return;
      }
      toast('ok', '파라미터 저장 완료');
      setEditing(null);
      load();
    } catch (e) {
      toast('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!strategies.length) return null;

  return (
    <div className="sec">
      <h3>전략 파라미터</h3>
      <div className="strat-list">
        {strategies.map((s) => (
          <div key={s.id} className="strat-item">
            <div className="strat-row">
              <span className="strat-name">
                {s.name}
                {s.recommended && <span className="strat-badge">추천</span>}
              </span>
              {editing !== s.id && (
                <button className="btn btn-outline btn-xs" onClick={() => startEdit(s)}>
                  편집
                </button>
              )}
            </div>
            {editing === s.id ? (
              <div className="strat-edit">
                {Object.entries(draft).map(([key, val]) => (
                  <label key={key}>
                    <span>{key}</span>
                    <input
                      type="number"
                      step="any"
                      value={val}
                      onChange={(e) => setDraft((p) => ({ ...p, [key]: Number(e.target.value) }))}
                    />
                  </label>
                ))}
                <div className="btn-grp">
                  <button className="btn btn-pri btn-xs" onClick={() => save(s.id)} disabled={saving}>
                    {saving ? '저장 중...' : '저장'}
                  </button>
                  <button className="btn btn-outline btn-xs" onClick={cancel}>
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="strat-params">
                {Object.entries(s.params).map(([k, v]) => (
                  <span key={k} className="strat-param">
                    {k}: {v}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
