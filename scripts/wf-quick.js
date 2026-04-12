/**
 * 빠른 WF 검증 (단일 마켓)
 * Usage: node scripts/wf-quick.js [market]
 */
const http = require('http');

const market = process.argv[2] || 'KRW-BTC';
const body = JSON.stringify({
  market,
  unit: '60',
  strategy: 'ensemble',
  startDate: '2026-01-01',
  endDate: '2026-04-12',
  capital: 1000000,
  windows: 4,
  trainRatio: 0.7,
  allowShort: false,
  useMarketDetector: true,
  optimizeStrategy: true,
  metric: 'calmar',
});

console.log(`WF: ensemble / ${market} / 60min`);
const start = Date.now();

const req = http.request(
  {
    hostname: 'localhost',
    port: 3008,
    path: '/api/assets/backtest/walk-forward',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  },
  (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      try {
        const r = JSON.parse(d);
        if (r.error) {
          console.log('ERROR:', r.error);
          return;
        }
        console.log(`완료 (${elapsed}초)`);
        console.log('OOS chain return:', (r.oos?.totalChainedReturn || 0).toFixed(2) + '%');
        console.log('Verdict:', r.analysis?.verdict || 'N/A');
        console.log(
          'Windows:',
          (r.chainedEquity || []).map((w, i) => 'W' + (i + 1) + ':' + (w.return || 0).toFixed(2) + '%').join(', '),
        );
        console.log('Trades:', r.oos?.totalTrades || 0);
        console.log('WinRate:', (r.oos?.avgWinRate || 0).toFixed(1) + '%');
        console.log('PF:', (r.oos?.avgProfitFactor || 0).toFixed(2));
        console.log('MDD:', (r.oos?.worstDrawdown || 0).toFixed(2) + '%');
        console.log('Robustness:', (r.analysis?.robustnessRatio || 0).toFixed(1) + '%');
        const ce = r.chainedEquity || [];
        if (ce.length > 0) {
          console.log('W1 best engine:', JSON.stringify(ce[0]?.bestParams?.engine));
          console.log('W1 best strategy:', JSON.stringify(ce[0]?.bestParams?.strategy));
        }
      } catch (e) {
        console.log('Parse error:', d.slice(0, 300));
      }
    });
  },
);
req.setTimeout(600000, () => req.destroy(new Error('timeout')));
req.write(body);
req.end();
