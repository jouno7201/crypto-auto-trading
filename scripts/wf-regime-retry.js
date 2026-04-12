/**
 * 상승장 누락분 보충 + 횡보장 ma-cross 보충
 * 429 에러/timeout으로 실패한 전략들만 재실행
 */
const http = require('http');

const TESTS = [
  // 상승장 (기간 단축: 2025-09-01 ~ 2025-10-31 = 2개월 횡보→약간 상승)
  // 아니, 실제 상승기는 2025-03~10 (너무 김). 2025-09~10 (약간 상승) 이나 2026-03-01~04-12 (5.8%+상승)
  // → 2026-03 상승기를 쓰자. window=2로 단축
  { strategy: 'macd', regime: '상승장', start: '2025-06-01', end: '2025-10-31', windows: 4 },
  { strategy: 'triple-ema', regime: '상승장', start: '2025-06-01', end: '2025-10-31', windows: 4 },
  { strategy: 'combo', regime: '상승장', start: '2025-06-01', end: '2025-10-31', windows: 4 },
  { strategy: 'mean-reversion', regime: '상승장', start: '2025-06-01', end: '2025-10-31', windows: 4 },
  { strategy: 'adaptive-momentum', regime: '상승장', start: '2025-06-01', end: '2025-10-31', windows: 4 },
  { strategy: 'ensemble', regime: '상승장', start: '2025-06-01', end: '2025-10-31', windows: 4 },
  { strategy: 'smart-range', regime: '상승장', start: '2025-06-01', end: '2025-10-31', windows: 4 },
  { strategy: 'volatility', regime: '상승장', start: '2025-06-01', end: '2025-10-31', windows: 4 },
  // 횡보장 누락
  { strategy: 'ma-cross', regime: '횡보장', start: '2026-01-01', end: '2026-04-12', windows: 4 },
];

function runWF(test) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      market: 'KRW-BTC',
      unit: '60',
      strategy: test.strategy,
      startDate: test.start,
      endDate: test.end,
      capital: 1000000,
      windows: test.windows,
      trainRatio: 0.7,
      allowShort: false,
      useMarketDetector: true,
      optimizeStrategy: true,
      metric: 'calmar',
    });

    const req = http.request(
      {
        hostname: 'localhost',
        port: 3008,
        path: '/api/assets/backtest/walk-forward',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 600000,
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const r = JSON.parse(d);
            if (r.error) {
              resolve({ ...test, error: r.error });
              return;
            }
            resolve({
              ...test,
              oosReturn: r.oos?.totalChainedReturn || 0,
              trades: r.oos?.totalTrades || 0,
              winRate: r.oos?.avgWinRate || 0,
              pf: r.oos?.avgProfitFactor || 0,
              mdd: r.oos?.worstDrawdown || 0,
              verdict: r.analysis?.verdict || 'N/A',
            });
          } catch (e) {
            resolve({ ...test, error: e.message });
          }
        });
      },
    );
    req.on('error', (e) => resolve({ ...test, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ...test, error: 'timeout' });
    });
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log(`재실행: ${TESTS.length}개 테스트\n`);

  for (let i = 0; i < TESTS.length; i++) {
    const t = TESTS[i];
    process.stdout.write(`[${i + 1}/${TESTS.length}] ${t.regime} ${t.strategy.padEnd(22)} ... `);
    const start = Date.now();
    const r = await runWF(t);
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);

    if (r.error) {
      console.log(`ERROR (${elapsed}s): ${r.error}`);
    } else {
      const mark = r.oosReturn > 0 ? '✅' : '❌';
      console.log(
        `${mark} OOS:${r.oosReturn.toFixed(2)}% WR:${r.winRate.toFixed(0)}% PF:${r.pf.toFixed(2)} MDD:${r.mdd.toFixed(1)}% (${elapsed}s)`,
      );
    }
    // 요청 간 3초 대기 (rate limit 회피)
    await sleep(3000);
  }
})();
