/**
 * 현물-only 주간 목표 수익률 탐색
 * - 전략 x 마켓 x 봉단위 조합을 워크포워드로 비교
 * - total return을 테스트 기간 주 수로 나눠 weekly avg 계산
 * Usage: node scripts/wf-search-weekly-target.js
 */

const http = require('http');

const BASE = 'http://localhost:3008';
const DEFAULT_STRATEGIES = ['mean-reversion', 'smart-range', 'triple-ema', 'macd', 'ensemble', 'bollinger'];
const DEFAULT_MARKETS = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP'];
const DEFAULT_UNITS = ['15', '30', '60'];
const START_DATE = '2026-01-01';
const END_DATE = '2026-04-12';
const FAST_MODE = process.argv.includes('--fast');
const WINDOWS = FAST_MODE ? 2 : 4;
const TRAIN_RATIO = 0.7;
const OPTIMIZE_STRATEGY = !FAST_MODE;
const REQUEST_TIMEOUT_MS = FAST_MODE ? 180000 : 600000;

function parseListArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  return raw
    .slice(prefix.length)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const STRATEGIES = parseListArg('strategies', DEFAULT_STRATEGIES);
const MARKETS = parseListArg('markets', DEFAULT_MARKETS);
const UNITS = parseListArg('units', DEFAULT_UNITS);

function postJSON(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3008,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let chunks = '';
        res.on('data', (chunk) => (chunks += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(chunks) });
          } catch {
            reject(new Error(`JSON parse error: ${chunks.slice(0, 200)}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
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

function fmtPct(value, digits = 2) {
  return `${value.toFixed(digits)}%`;
}

async function runCase(strategy, market, unit) {
  const payload = {
    strategy,
    market,
    unit,
    startDate: START_DATE,
    endDate: END_DATE,
    capital: 1000000,
    windows: WINDOWS,
    trainRatio: TRAIN_RATIO,
    allowShort: false,
    useMarketDetector: true,
    optimizeStrategy: OPTIMIZE_STRATEGY,
    metric: 'calmar',
  };

  const startedAt = Date.now();
  const { status, body } = await postJSON('/api/assets/backtest/walk-forward', payload);
  const elapsedSec = (Date.now() - startedAt) / 1000;

  if (status !== 200 || body.error) {
    throw new Error(body.error || `HTTP ${status}`);
  }

  const weeks = computeWeeks(body.windowDetails);
  const totalReturn = body.oos?.totalChainedReturn || 0;
  const weeklyAvg = weeks > 0 ? totalReturn / weeks : 0;

  return {
    strategy,
    market,
    unit,
    totalReturn,
    weeklyAvg,
    weeks,
    trades: body.oos?.totalTrades || 0,
    winRate: body.oos?.avgWinRate || 0,
    profitFactor: body.oos?.avgProfitFactor || 0,
    maxDrawdown: body.oos?.worstDrawdown || 0,
    verdict: body.analysis?.verdict || 'N/A',
    file: body.file || null,
    elapsedSec,
  };
}

async function main() {
  const cases = [];
  for (const strategy of STRATEGIES) {
    for (const market of MARKETS) {
      for (const unit of UNITS) {
        cases.push({ strategy, market, unit });
      }
    }
  }

  console.log('=== Spot-Only Weekly Target Search ===');
  console.log(`기간: ${START_DATE} ~ ${END_DATE}`);
  console.log(`조합 수: ${cases.length}`);
  console.log(
    `모드: ${FAST_MODE ? 'fast-scan' : 'full-validate'} / windows=${WINDOWS} / optimizeStrategy=${OPTIMIZE_STRATEGY}`,
  );

  const results = [];
  let index = 0;

  for (const item of cases) {
    index += 1;
    process.stdout.write(`[${index}/${cases.length}] ${item.strategy}/${item.market}/${item.unit}m ... `);
    try {
      const result = await runCase(item.strategy, item.market, item.unit);
      results.push(result);
      const marker = result.weeklyAvg >= 1 ? '🎯' : result.weeklyAvg > 0 ? '✅' : '❌';
      console.log(
        `${marker} total ${fmtPct(result.totalReturn)} | weekly ${fmtPct(result.weeklyAvg, 3)} | trades ${result.trades} | ${result.verdict}`,
      );
    } catch (error) {
      console.log(`ERROR ${error.message}`);
      results.push({ ...item, error: error.message, weeklyAvg: -Infinity, totalReturn: -Infinity });
    }
  }

  const valid = results.filter((result) => !result.error).sort((left, right) => right.weeklyAvg - left.weeklyAvg);
  const hitTarget = valid.filter((result) => result.weeklyAvg >= 1);

  console.log('\n=== Top 15 by Weekly Avg ===');
  console.log('strategy            market      unit   total%   weekly% trades   pf    mdd  verdict');
  for (const result of valid.slice(0, 15)) {
    console.log(
      `${result.strategy.padEnd(20)} ${result.market.padEnd(10)} ${String(result.unit).padStart(4)} ${fmtPct(result.totalReturn).padStart(8)} ${fmtPct(result.weeklyAvg, 3).padStart(9)} ${String(result.trades).padStart(6)} ${result.profitFactor.toFixed(2).padStart(5)} ${fmtPct(result.maxDrawdown).padStart(7)} ${result.verdict}`,
    );
  }

  console.log('\n=== Weekly >= 1% ===');
  if (hitTarget.length === 0) {
    console.log('없음');
  } else {
    for (const result of hitTarget) {
      console.log(
        `${result.strategy}/${result.market}/${result.unit}m => total ${fmtPct(result.totalReturn)}, weekly ${fmtPct(result.weeklyAvg, 3)}, trades ${result.trades}, file ${result.file}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
