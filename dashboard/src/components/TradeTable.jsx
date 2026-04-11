import { fmtNum, fmtPct, fmtDate, pnlClass } from '../utils';

export default function TradeTable({ trades }) {
  if (!trades?.length) {
    return <div className="empty">거래 내역이 없습니다</div>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>시각</th>
          <th>타입</th>
          <th>가격</th>
          <th>수익</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t, i) => {
          const pnl = t.pnl || t.profit || 0;
          const side = (t.type || t.side || '').toLowerCase();
          const sideClass = side === 'buy' ? 'td-type td-buy' : side === 'sell' ? 'td-type td-sell' : 'td-type';
          return (
            <tr key={t.id || i}>
              <td>{fmtDate(t.timestamp || t.time)}</td>
              <td className={sideClass}>{t.type || t.side || '-'}</td>
              <td>{fmtNum(t.price)}</td>
              <td className={pnlClass(pnl)}>{fmtPct(pnl)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
