/**
 * 저장된 walkforward 결과를 전수 감사한다.
 * - spot-only / long-short / unknown 분류
 * - 숏 거래 혼입 여부 추론
 * - 주간 평균 수익률 환산
 * Usage: node scripts/wf-audit-results.js
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'data', 'backtest-results');

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeWeeks(windowDetails = []) {
  let totalMs = 0;
  for (const window of windowDetails) {
    const start = parseDate(window?.period?.test?.start);
    const end = parseDate(window?.period?.test?.end);
    if (!start || !end || end <= start) continue;
    totalMs += end.getTime() - start.getTime();
  }
  return totalMs > 0 ? totalMs / (7 * 24 * 60 * 60 * 1000) : 0;
}

function countShortTrades(result) {
  if (Number.isFinite(result?.oos?.shortTrades)) return result.oos.shortTrades;

  const windows = Array.isArray(result?.windowDetails) ? result.windowDetails : [];
  let total = 0;

  for (const window of windows) {
    if (Number.isFinite(window?.test?.shortTrades)) {
      total += window.test.shortTrades;
      continue;
    }

    const trades = Array.isArray(window?.testTradeLog) ? window.testTradeLog : [];
    total += trades.filter((trade) => trade?.side === 'short').length;
  }

  return total;
}

function countLongTrades(result) {
  if (Number.isFinite(result?.oos?.longTrades)) return result.oos.longTrades;

  const windows = Array.isArray(result?.windowDetails) ? result.windowDetails : [];
  let total = 0;

  for (const window of windows) {
    if (Number.isFinite(window?.test?.longTrades)) {
      total += window.test.longTrades;
      continue;
    }

    const trades = Array.isArray(window?.testTradeLog) ? window.testTradeLog : [];
    total += trades.filter((trade) => trade?.side === 'long').length;
  }

  return total;
}

function classifyResult(result, file) {
  const constraints = result?.constraints || {};
  const shortTrades = countShortTrades(result);
  const longTrades = countLongTrades(result);
  const weeks = computeWeeks(result?.windowDetails);
  const totalReturn = toNumber(result?.oos?.totalChainedReturn);
  const avgReturn = toNumber(result?.oos?.avgReturn);
  const weeklyAvg = weeks > 0 ? totalReturn / weeks : 0;
  const allowShort = typeof constraints.allowShort === 'boolean' ? constraints.allowShort : null;

  let classification = 'unknown';
  if (allowShort === false && shortTrades === 0) {
    classification = 'spot-only-confirmed';
  } else if (allowShort === true || shortTrades > 0) {
    classification = 'long-short';
  } else if (allowShort === null && shortTrades === 0) {
    classification = 'spot-only-inferred';
  }

  return {
    file,
    strategy: result?.strategy || 'unknown',
    classification,
    allowShort,
    shortTrades,
    longTrades,
    totalTrades: toNumber(result?.oos?.totalTrades),
    totalReturn,
    avgReturn,
    weeklyAvg,
    weeks,
    verdict: result?.analysis?.verdict || 'N/A',
    spotCompatible: result?.analysis?.spotCompatible ?? (classification !== 'long-short' && shortTrades === 0),
    testStart: result?.windowDetails?.[0]?.period?.test?.start || null,
    testEnd: result?.windowDetails?.[result.windowDetails?.length - 1]?.period?.test?.end || null,
  };
}

function formatRow(item) {
  return [
    item.strategy.padEnd(20),
    item.classification.padEnd(20),
    `${item.totalReturn.toFixed(2)}%`.padStart(9),
    `${item.weeklyAvg.toFixed(3)}%`.padStart(10),
    String(item.totalTrades).padStart(6),
    String(item.shortTrades).padStart(6),
    ` ${item.file}`,
  ].join('');
}

function main() {
  const files = fs
    .readdirSync(RESULTS_DIR)
    .filter((name) => name.startsWith('walkforward_') && name.endsWith('.json'))
    .sort();

  const audited = [];
  for (const file of files) {
    const fullPath = path.join(RESULTS_DIR, file);
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const parsed = JSON.parse(raw);
      audited.push(classifyResult(parsed, file));
    } catch (error) {
      audited.push({
        file,
        strategy: 'parse-error',
        classification: 'error',
        allowShort: null,
        shortTrades: 0,
        longTrades: 0,
        totalTrades: 0,
        totalReturn: 0,
        avgReturn: 0,
        weeklyAvg: 0,
        weeks: 0,
        verdict: error.message,
        spotCompatible: false,
        testStart: null,
        testEnd: null,
      });
    }
  }

  const spotOnly = audited
    .filter((item) => item.classification === 'spot-only-confirmed' || item.classification === 'spot-only-inferred')
    .sort((left, right) => right.weeklyAvg - left.weeklyAvg);
  const longShort = audited
    .filter((item) => item.classification === 'long-short')
    .sort((left, right) => right.totalReturn - left.totalReturn);

  const summary = {
    totalFiles: audited.length,
    spotOnlyConfirmed: audited.filter((item) => item.classification === 'spot-only-confirmed').length,
    spotOnlyInferred: audited.filter((item) => item.classification === 'spot-only-inferred').length,
    longShort: longShort.length,
    errors: audited.filter((item) => item.classification === 'error').length,
    bestSpotOnly: spotOnly.slice(0, 10),
    bestLongShort: longShort.slice(0, 10),
  };

  console.log('=== Saved Walk-Forward Audit ===');
  console.log(
    JSON.stringify(
      {
        totalFiles: summary.totalFiles,
        spotOnlyConfirmed: summary.spotOnlyConfirmed,
        spotOnlyInferred: summary.spotOnlyInferred,
        longShort: summary.longShort,
        errors: summary.errors,
      },
      null,
      2,
    ),
  );

  console.log('\n--- Top Spot-Compatible Candidates ---');
  console.log('strategy            classification        total%   weekly% trades shorts file');
  for (const item of summary.bestSpotOnly) {
    console.log(formatRow(item));
  }

  console.log('\n--- Top Long-Short Results ---');
  console.log('strategy            classification        total%   weekly% trades shorts file');
  for (const item of summary.bestLongShort) {
    console.log(formatRow(item));
  }
}

main();
