/**
 * 공격형 현물 전략 집중 검증
 * Usage: node scripts/wf-validate-aggressive.js
 */

const http = require('http');
const { createStrategy } = require('../src/strategies');
const { fetchUpbitCandlesByRange } = require('../src/engine/dataCollector');
const { runWalkForward } = require('../src/engine/walkForward');

const CASES = [
  { market: 'KRW-BTC', unit: '30', label: 'BTC 30m' },
  { market: 'KRW-BTC', unit: '60', label: 'BTC 60m' },
  { market: 'KRW-ETH', unit: '60', label: 'ETH 60m' },
];

function parseArg(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : null;
}

const marketFilter = parseArg('market');
const unitFilter = parseArg('unit');
const windowsArg = parseArg('windows');
const runLocal = process.argv.includes('--local');
const filteredCases = CASES.filter((item) => {
  if (marketFilter && item.market !== marketFilter) return false;
  if (unitFilter && item.unit !== unitFilter) return false;
  return true;
});

const PAYLOAD_BASE = {
  strategy: 'aggressive-spot-momentum',
  startDate: '2026-01-01',
  endDate: '2026-04-12',
  capital: 1000000,
  windows: windowsArg ? parseInt(windowsArg, 10) : 4,
  trainRatio: 0.7,
  allowShort: false,
  useMarketDetector: true,
  optimizeStrategy: false,
  metric: 'calmar',
};

function requestWalkForward(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3008,
        path: '/api/assets/backtest/walk-forward',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let chunks = '';
        res.on('data', (chunk) => (chunks += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(chunks);
            if (res.statusCode !== 200 || parsed.error) {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
              return;
            }
            resolve(parsed);
          } catch {
            reject(new Error(`JSON parse error: ${chunks.slice(0, 200)}`));
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

async function runLocalWalkForward(payload) {
  const candles = await fetchUpbitCandlesByRange(payload.market, payload.unit, payload.startDate, payload.endDate);
  return runWalkForward(createStrategy, payload.strategy, candles, {
    windows: payload.windows,
    trainRatio: payload.trainRatio,
    initialCapital: payload.capital,
    allowShort: payload.allowShort,
    useMarketDetector: payload.useMarketDetector,
    optimizeStrategy: payload.optimizeStrategy,
    metric: payload.metric,
  });
}

function computeWeeks(windowDetails = []) {
  let totalMs = 0;
  for (const window of windowDetails) {
    const start = new Date(window?.period?.test?.start);
    const end = new Date(window?.period?.test?.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    totalMs += end.getTime() - start.getTime();
  }
  return totalMs > 0 ? totalMs / (7 * 24 * 60 * 60 * 1000) : 0;
}

async function main() {
  console.log('=== Aggressive Spot Momentum WF Validation ===');
  console.log(`기간: ${PAYLOAD_BASE.startDate} ~ ${PAYLOAD_BASE.endDate}`);
  console.log(`전략: ${PAYLOAD_BASE.strategy}`);
  console.log(`케이스 수: ${filteredCases.length}`);
  console.log(`실행 방식: ${runLocal ? 'local-direct' : 'api'}`);
  console.log('');

  const rows = [];

  for (const item of filteredCases) {
    const payload = { ...PAYLOAD_BASE, market: item.market, unit: item.unit };
    const startedAt = Date.now();
    console.log(`⏳ ${item.label} 검증 중...`);
    try {
      const result = runLocal ? await runLocalWalkForward(payload) : await requestWalkForward(payload);
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      const weeks = computeWeeks(result.windowDetails || []);
      const totalReturn = result.oos?.totalChainedReturn || 0;
      const weeklyAvg = weeks > 0 ? totalReturn / weeks : 0;
      const row = {
        label: item.label,
        market: item.market,
        unit: item.unit,
        totalReturn,
        weeklyAvg,
        weeks,
        trades: result.oos?.totalTrades || 0,
        longTrades: result.oos?.longTrades || 0,
        shortTrades: result.oos?.shortTrades || 0,
        winRate: result.oos?.avgWinRate || 0,
        profitFactor: result.oos?.avgProfitFactor || 0,
        mdd: result.oos?.worstDrawdown || 0,
        verdict: result.analysis?.verdict || 'N/A',
        spotCompatible: result.analysis?.spotCompatible,
        file: result.file || null,
      };
      rows.push(row);
      console.log(
        `  ✅ ${elapsedSec}s | total ${totalReturn.toFixed(2)}% | weekly ${weeklyAvg.toFixed(3)}% | trades ${row.trades} | ${row.verdict}`,
      );
    } catch (error) {
      rows.push({ label: item.label, error: error.message });
      console.log(`  ❌ ${error.message}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log('case         total%   weekly% trades longs shorts   wr%    pf    mdd   spot verdict');
  for (const row of rows) {
    if (row.error) {
      console.log(`${row.label.padEnd(12)} ERROR ${row.error}`);
      continue;
    }
    console.log(
      `${row.label.padEnd(12)} ${row.totalReturn.toFixed(2).padStart(7)} ${row.weeklyAvg.toFixed(3).padStart(9)} ${String(row.trades).padStart(6)} ${String(row.longTrades).padStart(5)} ${String(row.shortTrades).padStart(6)} ${row.winRate.toFixed(1).padStart(6)} ${row.profitFactor.toFixed(2).padStart(6)} ${row.mdd.toFixed(2).padStart(6)} ${String(row.spotCompatible).padStart(6)} ${row.verdict}`,
    );
    console.log(`  file: ${row.file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
