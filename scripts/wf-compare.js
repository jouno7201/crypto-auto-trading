/**
 * WF 검증 비교: engine-only vs strategy+engine
 * Usage: node scripts/wf-compare.js
 */
const http = require('http');

function postJSON(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch {
            reject(new Error('Parse: ' + d.slice(0, 200)));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(600000, () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

const BASE = 'http://localhost:3008';

const configs = [
  { label: 'BTC engine-only (04-09)', market: 'KRW-BTC', endDate: '2026-04-09', optimizeStrategy: false },
  { label: 'BTC engine+strat (04-09)', market: 'KRW-BTC', endDate: '2026-04-09', optimizeStrategy: true },
  { label: 'BTC engine-only (04-12)', market: 'KRW-BTC', endDate: '2026-04-12', optimizeStrategy: false },
  { label: 'ETH engine-only (04-12)', market: 'KRW-ETH', endDate: '2026-04-12', optimizeStrategy: false },
  { label: 'XRP engine-only (04-12)', market: 'KRW-XRP', endDate: '2026-04-12', optimizeStrategy: false },
];

async function main() {
  console.log('=== WF Ensemble 비교 검증 ===\n');

  for (const cfg of configs) {
    console.log(`⏳ ${cfg.label}...`);
    const start = Date.now();
    try {
      const r = await postJSON(`${BASE}/api/assets/backtest/walk-forward`, {
        market: cfg.market,
        unit: '60',
        strategy: 'ensemble',
        startDate: '2026-01-01',
        endDate: cfg.endDate,
        capital: 1000000,
        windows: 4,
        trainRatio: 0.7,
        allowShort: false,
        useMarketDetector: true,
        optimizeStrategy: cfg.optimizeStrategy,
        metric: 'calmar',
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      if (r.error) {
        console.log(`  ❌ ${r.error}`);
        continue;
      }
      const oos = r.oos || {};
      const a = r.analysis || {};
      const wins = (r.chainedEquity || []).map((w) => (w.return || 0).toFixed(2) + '%').join(', ');
      console.log(`  ✅ (${elapsed}s) OOS: ${(oos.totalChainedReturn || 0).toFixed(2)}% | ${a.verdict || 'N/A'}`);
      console.log(
        `     Windows: [${wins}] | Trades: ${oos.totalTrades || 0} | WR: ${(oos.avgWinRate || 0).toFixed(1)}% | PF: ${(oos.avgProfitFactor || 0).toFixed(2)} | MDD: ${(oos.worstDrawdown || 0).toFixed(2)}%`,
      );
    } catch (err) {
      console.log(`  ❌ ${err.message}`);
    }
    console.log('');
  }
}

main().catch(console.error);
