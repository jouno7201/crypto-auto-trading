export default function StatCard({ label, value, sub, valueClass }) {
  return (
    <div className="card">
      <div className="card-lbl">{label}</div>
      <div className={`card-val ${valueClass || ''}`}>{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
  );
}
