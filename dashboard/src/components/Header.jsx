export default function Header({ wsStatus }) {
  const state = wsStatus === 'on' ? 'on' : wsStatus === 'ing' ? 'ing' : 'off';
  const label = state === 'on' ? '실시간' : state === 'ing' ? '연결 중' : '끊김';

  return (
    <div className="hdr">
      <h1>
        🪙 <span>코인 자동매매</span>
      </h1>
      <div className="hdr-r">
        <div className={`ws-badge ${state}`}>
          <span className={`ws-dot ${state}`} />
          {label}
        </div>
      </div>
    </div>
  );
}
