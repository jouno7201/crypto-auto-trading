export function fmtNum(n) {
  return n == null ? '-' : Number(n).toLocaleString();
}

export function fmtPct(n) {
  return n == null ? '-' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;
}

export function fmtDate(d) {
  if (!d) return '-';
  const t = new Date(d);
  return `${t.toLocaleDateString('ko')} ${t.toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' })}`;
}

export function pnlClass(v) {
  return (v || 0) >= 0 ? 'pos' : 'neg';
}

export const MARKETS = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL', 'KRW-DOGE'];

export const STRATEGIES = [
  { value: 'ma-cross', label: 'MA Cross' },
  { value: 'rsi', label: 'RSI' },
  { value: 'bollinger', label: 'Bollinger' },
  { value: 'macd', label: 'MACD' },
  { value: 'triple-ema', label: 'Triple EMA' },
  { value: 'combo', label: 'Combo' },
  { value: 'mean-reversion', label: 'Mean Reversion' },
  { value: 'volatility', label: 'Volatility' },
  { value: 'adaptive-momentum', label: 'Adaptive Momentum' },
  { value: 'ensemble', label: 'Ensemble' },
  { value: 'smart-range', label: 'Smart Range' },
];

export const UNITS = [
  { value: '1', label: '1분' },
  { value: '5', label: '5분' },
  { value: '15', label: '15분' },
  { value: '60', label: '1시간' },
  { value: '240', label: '4시간' },
];

export const CHART_UNITS = [...UNITS, { value: '1440', label: '일봉' }];
