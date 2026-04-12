const upbit = require('../src/api/upbit');
(async () => {
  const candles = await upbit.getDailyCandles('KRW-BTC', 200);
  candles.sort((a, b) => a.timestamp - b.timestamp);
  const monthly = {};
  candles.forEach((c) => {
    const m = new Date(c.timestamp).toISOString().slice(0, 7);
    if (!monthly[m]) monthly[m] = { open: c.open, close: c.close, high: c.high, low: c.low };
    monthly[m].close = c.close;
    monthly[m].high = Math.max(monthly[m].high, c.high);
    monthly[m].low = Math.min(monthly[m].low, c.low);
  });
  console.log('Month      | Open         | Close        | Chg%   | Range% | Regime');
  console.log('-'.repeat(80));
  Object.entries(monthly).forEach(([m, d]) => {
    const chg = (((d.close - d.open) / d.open) * 100).toFixed(1);
    const rng = (((d.high - d.low) / d.open) * 100).toFixed(1);
    let regime = '횡보';
    if (Number(chg) > 5) regime = '상승';
    else if (Number(chg) < -5) regime = '하락';
    console.log(
      `${m} | ${d.open.toLocaleString().padStart(13)} | ${d.close.toLocaleString().padStart(13)} | ${chg.padStart(6)}% | ${rng.padStart(5)}% | ${regime}`,
    );
  });
})().catch((e) => console.error(e.message));
