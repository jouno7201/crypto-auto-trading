import { MARKETS, STRATEGIES, UNITS } from '../utils';

export default function BotPanel({ config, setConfig, onApply, onStart, onStop, botRunning }) {
  return (
    <div className="sec">
      <h3>봇 설정</h3>
      <div className="bot-cfg">
        <label>
          마켓
          <select value={config.market} onChange={(e) => setConfig((p) => ({ ...p, market: e.target.value }))}>
            {MARKETS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          전략
          <select value={config.strategy} onChange={(e) => setConfig((p) => ({ ...p, strategy: e.target.value }))}>
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          봉 단위
          <select value={config.unit} onChange={(e) => setConfig((p) => ({ ...p, unit: e.target.value }))}>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="btn-grp">
        <button className="btn btn-outline" onClick={onApply}>
          적용
        </button>
        <button className="btn btn-go" onClick={onStart} disabled={botRunning}>
          ▶ 시작
        </button>
        <button className="btn btn-stop" onClick={onStop} disabled={!botRunning}>
          ⏹ 정지
        </button>
      </div>
    </div>
  );
}
