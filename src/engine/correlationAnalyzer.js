/**
 * 마켓 간 상관관계 분석 모듈
 * - 피어슨 상관계수 기반 마켓 간 수익률 상관관계
 * - 포트폴리오 분산 효과 판단
 * - 최적 마켓 조합 추천
 */

const { fetchUpbitCandlesByRange, fetchUpbitCandles } = require('./dataCollector');
const { createLogger } = require('../utils/logger');

const log = createLogger('correlation');

/**
 * 수익률 배열 계산 (로그 수익률)
 */
function calcReturns(prices) {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  return returns;
}

/**
 * 피어슨 상관계수
 */
function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * 연간화 변동성 (시간봉 기준)
 */
function annualizedVolatility(returns) {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(24 * 365); // 시간봉 → 연간
}

/**
 * 여러 마켓의 캔들 데이터 동시 수집 (동일 타임스탬프 정렬)
 */
async function fetchMultiMarketData(markets, unit = '60', count = 500) {
  const results = {};

  // 병렬 데이터 수집
  const promises = markets.map(async (market) => {
    try {
      const candles = await fetchUpbitCandles(market, unit, count);
      return { market, candles };
    } catch (err) {
      log.warn({ market, err: err.message }, '캔들 수집 실패');
      return { market, candles: [] };
    }
  });

  // 순차 실행 (Upbit rate limit 대응: 마켓당 간격)
  for (const p of promises) {
    const { market, candles } = await p;
    if (candles.length > 0) {
      results[market] = candles;
    }
    // Upbit rate limit 방어
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}

/**
 * 마켓 간 상관관계 매트릭스 계산
 * @param {string[]} markets - 마켓 코드 배열 (예: ['KRW-BTC', 'KRW-ETH'])
 * @param {object} options - { unit, count }
 * @returns {object} { matrix, markets, stats }
 */
async function calculateCorrelationMatrix(markets, options = {}) {
  const { unit = '60', count = 500 } = options;

  log.info({ markets, unit, count }, '상관관계 분석 시작');

  // 1. 데이터 수집
  const data = await fetchMultiMarketData(markets, unit, count);
  const validMarkets = Object.keys(data).filter((m) => data[m].length > 50);

  if (validMarkets.length < 2) {
    return { error: '분석 가능한 마켓이 2개 미만입니다', markets: validMarkets };
  }

  // 2. 타임스탬프 기반 정렬 (공통 구간만 사용)
  const timestampSets = validMarkets.map((m) => new Set(data[m].map((c) => c.timestamp)));
  const commonTimestamps = [...timestampSets[0]].filter((ts) =>
    timestampSets.every((set) => set.has(ts)),
  );
  commonTimestamps.sort((a, b) => a - b);

  if (commonTimestamps.length < 50) {
    return { error: '공통 구간 캔들이 부족합니다', common: commonTimestamps.length };
  }

  // 3. 정렬된 종가 추출
  const priceMap = {};
  for (const market of validMarkets) {
    const byTs = new Map(data[market].map((c) => [c.timestamp, c.close]));
    priceMap[market] = commonTimestamps.map((ts) => byTs.get(ts));
  }

  // 4. 수익률 계산
  const returnsMap = {};
  const statsMap = {};
  for (const market of validMarkets) {
    const returns = calcReturns(priceMap[market]);
    returnsMap[market] = returns;

    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    statsMap[market] = {
      meanReturn: (meanReturn * 100).toFixed(4),
      volatility: (annualizedVolatility(returns) * 100).toFixed(2),
      dataPoints: returns.length,
      lastPrice: priceMap[market][priceMap[market].length - 1],
    };
  }

  // 5. 상관관계 매트릭스
  const matrix = {};
  for (const m1 of validMarkets) {
    matrix[m1] = {};
    for (const m2 of validMarkets) {
      matrix[m1][m2] = parseFloat(
        pearsonCorrelation(returnsMap[m1], returnsMap[m2]).toFixed(4),
      );
    }
  }

  // 6. 분산 효과 점수 (낮은 상관관계 = 높은 분산 효과)
  const pairs = [];
  for (let i = 0; i < validMarkets.length; i++) {
    for (let j = i + 1; j < validMarkets.length; j++) {
      const corr = matrix[validMarkets[i]][validMarkets[j]];
      pairs.push({
        pair: [validMarkets[i], validMarkets[j]],
        correlation: corr,
        diversification: corr < 0.5 ? 'good' : corr < 0.8 ? 'moderate' : 'low',
      });
    }
  }
  pairs.sort((a, b) => a.correlation - b.correlation);

  log.info({ markets: validMarkets.length, common: commonTimestamps.length }, '상관관계 분석 완료');

  return {
    markets: validMarkets,
    matrix,
    stats: statsMap,
    pairs,
    period: {
      from: new Date(commonTimestamps[0]).toISOString(),
      to: new Date(commonTimestamps[commonTimestamps.length - 1]).toISOString(),
      candles: commonTimestamps.length,
    },
  };
}

/**
 * 최적 멀티마켓 포트폴리오 추천
 * - 변동성이 적절하고, 상관관계가 낮은 조합 추천
 */
async function recommendPortfolio(candidateMarkets, options = {}) {
  const { maxMarkets = 4, unit = '60', count = 500 } = options;

  const result = await calculateCorrelationMatrix(candidateMarkets, { unit, count });
  if (result.error) return result;

  const { markets, matrix, stats, pairs } = result;

  // 그리디: 가장 분산 효과가 좋은 마켓부터 추가
  const selected = [markets[0]]; // BTC 우선 포함

  while (selected.length < maxMarkets && selected.length < markets.length) {
    let bestMarket = null;
    let bestScore = Infinity;

    for (const candidate of markets) {
      if (selected.includes(candidate)) continue;

      // 기존 포트폴리오와의 평균 상관관계
      const avgCorr =
        selected.reduce((sum, m) => sum + Math.abs(matrix[candidate][m]), 0) / selected.length;

      if (avgCorr < bestScore) {
        bestScore = avgCorr;
        bestMarket = candidate;
      }
    }

    if (bestMarket) selected.push(bestMarket);
    else break;
  }

  return {
    recommended: selected,
    analysis: result,
    reasoning: selected.map((m) => ({
      market: m,
      avgCorrelationWithOthers: parseFloat(
        (
          selected
            .filter((o) => o !== m)
            .reduce((sum, o) => sum + Math.abs(matrix[m][o]), 0) /
          Math.max(selected.length - 1, 1)
        ).toFixed(4),
      ),
      volatility: stats[m].volatility,
    })),
  };
}

module.exports = {
  calculateCorrelationMatrix,
  recommendPortfolio,
  pearsonCorrelation,
  calcReturns,
  annualizedVolatility,
};
