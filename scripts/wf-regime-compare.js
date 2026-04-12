/**
 * 전략 × 시장구간 종합 WF 비교
 *
 * 구간:
 *   하락장: 2025-11-01 ~ 2026-02-28 (4개월, -40%)
 *   상승장: 2025-03-01 ~ 2025-10-31 (8개월, 꾸준 상승기)
 *   횡보장: 2026-01-01 ~ 2026-04-12 (최근 3.5개월)
 *
 * 전략: 11개 전부 테스트
 */
const http = require('http');

const STRATEGIES = [
  'ma-cross',
  'rsi',
  'bollinger',
  'macd',
  'triple-ema',
  'combo',
  'mean-reversion',
  'adaptive-momentum',
  'ensemble',
  'smart-range',
  'volatility',
];

const REGIMES = [
  { name: '하락장', start: '2025-11-01', end: '2026-02-28', windows: 4 },
  { name: '상승장', start: '2025-03-01', end: '2025-10-31', windows: 4 },
  { name: '횡보장', start: '2026-01-01', end: '2026-04-12', windows: 4 },
];

function runWF(strategy, regime) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      market: 'KRW-BTC',
      unit: '60',
      strategy,
      startDate: regime.start,
      endDate: regime.end,
      capital: 1000000,
      windows: regime.windows,
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
        timeout: 300000,
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const r = JSON.parse(d);
            if (r.error) {
              resolve({ strategy, regime: regime.name, error: r.error });
              return;
            }
            resolve({
              strategy,
              regime: regime.name,
              oosReturn: r.oos?.totalChainedReturn || 0,
              trades: r.oos?.totalTrades || 0,
              winRate: r.oos?.avgWinRate || 0,
              pf: r.oos?.avgProfitFactor || 0,
              mdd: r.oos?.worstDrawdown || 0,
              verdict: r.analysis?.verdict || 'N/A',
              robustness: r.analysis?.robustnessRatio || 0,
              windows: (r.chainedEquity || []).map((w, i) => ({
                w: i + 1,
                ret: (w.return || 0).toFixed(2) + '%',
              })),
            });
          } catch (e) {
            resolve({ strategy, regime: regime.name, error: e.message });
          }
        });
      },
    );
    req.on('error', (e) => resolve({ strategy, regime: regime.name, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ strategy, regime: regime.name, error: 'timeout' });
    });
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const results = [];
  const total = STRATEGIES.length * REGIMES.length;
  let done = 0;

  for (const regime of REGIMES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${regime.name} (${regime.start} ~ ${regime.end})`);
    console.log(`${'='.repeat(60)}`);

    for (const strat of STRATEGIES) {
      done++;
      process.stdout.write(`[${done}/${total}] ${strat.padEnd(20)} ... `);
      const start = Date.now();
      const r = await runWF(strat, regime);
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      results.push(r);

      if (r.error) {
        console.log(`ERROR (${elapsed}s): ${r.error}`);
      } else {
        const mark = r.oosReturn > 0 ? '✅' : '❌';
        console.log(
          `${mark} OOS:${r.oosReturn.toFixed(2)}% WR:${r.winRate.toFixed(0)}% PF:${r.pf.toFixed(2)} MDD:${r.mdd.toFixed(1)}% (${elapsed}s)`,
        );
      }
      // 요청 간 딜레이 (rate limit)
      await sleep(500);
    }
  }

  // === 최종 요약 ===
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('  최종 결과 요약');
  console.log(`${'='.repeat(80)}`);

  for (const regime of REGIMES) {
    console.log(`\n▶ ${regime.name} (${regime.start} ~ ${regime.end})`);
    console.log(
      'Strategy'.padEnd(22) +
        'OOS%'.padStart(8) +
        'WR%'.padStart(7) +
        'PF'.padStart(7) +
        'MDD%'.padStart(8) +
        '  Verdict',
    );
    console.log('-'.repeat(65));

    const regimeResults = results
      .filter((r) => r.regime === regime.name && !r.error)
      .sort((a, b) => b.oosReturn - a.oosReturn);

    regimeResults.forEach((r, i) => {
      const mark = i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : '';
      console.log(
        r.strategy.padEnd(22) +
          r.oosReturn.toFixed(2).padStart(8) +
          r.winRate.toFixed(0).padStart(7) +
          r.pf.toFixed(2).padStart(7) +
          r.mdd.toFixed(1).padStart(8) +
          '  ' +
          r.verdict +
          mark,
      );
    });

    const errored = results.filter((r) => r.regime === regime.name && r.error);
    if (errored.length > 0) {
      console.log('Errors:', errored.map((e) => `${e.strategy}(${e.error.slice(0, 30)})`).join(', '));
    }
  }

  // 시장별 1등 전략
  console.log(`\n${'='.repeat(80)}`);
  console.log('  시장별 추천 전략 Top 3');
  console.log(`${'='.repeat(80)}`);
  for (const regime of REGIMES) {
    const top = results
      .filter((r) => r.regime === regime.name && !r.error)
      .sort((a, b) => b.oosReturn - a.oosReturn)
      .slice(0, 3);
    console.log(`\n${regime.name}:`);
    top.forEach((r, i) => {
      console.log(
        `  ${i + 1}. ${r.strategy} → OOS: ${r.oosReturn.toFixed(2)}% (WR:${r.winRate.toFixed(0)}%, PF:${r.pf.toFixed(2)}, MDD:${r.mdd.toFixed(1)}%)`,
      );
    });
  }
})();
