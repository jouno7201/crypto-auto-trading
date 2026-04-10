/**
 * 마켓별 최적 전략 매칭
 * - 빠른 백테스트로 각 마켓에 가장 적합한 전략 자동 선정
 * - 수익률, 샤프비율, 승률 종합 평가
 */

const { fetchUpbitCandles } = require('./dataCollector');
const { runBacktest } = require('./backtest');
const { createStrategy, STRATEGIES } = require('../strategies');
const { createLogger } = require('../utils/logger');

const log = createLogger('strategy-matcher');

// 매칭 대상 전략 (가벼운 전략만, 너무 느린 전략 제외)
const CANDIDATE_STRATEGIES = [
  'ma-cross',
  'rsi',
  'macd',
  'bollinger',
  'mean-reversion',
  'triple-ema',
  'adaptive-momentum',
  'ensemble',
];

/**
 * 단일 마켓에서 모든 후보 전략 백테스트
 * @param {string} market - 마켓 코드
 * @param {object} options - { unit, count, capital }
 * @returns {object[]} 전략별 성과 정렬 배열
 */
async function matchStrategiesForMarket(market, options = {}) {
  const { unit = '60', count = 500, capital = 1_000_000 } = options;

  log.info({ market, unit, count }, '전략 매칭 시작');

  const candles = await fetchUpbitCandles(market, unit, count);
  if (candles.length < 100) {
    return { market, error: '캔들 데이터 부족', candles: candles.length };
  }

  const results = [];

  for (const stratName of CANDIDATE_STRATEGIES) {
    if (!STRATEGIES[stratName]) continue;

    try {
      const strategy = createStrategy(stratName);
      const bt = runBacktest(strategy, candles, {
        initialCapital: capital,
        useMarketDetector: true,
      });

      results.push({
        strategy: stratName,
        totalReturn: bt.performance?.totalReturn || 0,
        sharpe: bt.performance?.sharpeRatio || 0,
        maxDrawdown: bt.performance?.maxDrawdown || 0,
        winRate: bt.trades?.winRate || 0,
        totalTrades: bt.trades?.total || 0,
        profitFactor: bt.performance?.profitFactor || 0,
        // 종합 점수: 수익률 40% + 샤프 30% + 승률 20% + (1-MDD) 10%
        score: 0,
      });
    } catch (err) {
      log.warn({ market, strategy: stratName, err: err.message }, '백테스트 실패');
    }
  }

  if (results.length === 0) {
    return { market, error: '백테스트 결과 없음', results: [] };
  }

  // 정규화 및 종합 점수 계산
  const maxReturn = Math.max(...results.map((r) => r.totalReturn), 0.01);
  const maxSharpe = Math.max(...results.map((r) => r.sharpe), 0.01);

  for (const r of results) {
    const returnScore = Math.max(r.totalReturn, 0) / Math.abs(maxReturn);
    const sharpeScore = Math.max(r.sharpe, 0) / Math.abs(maxSharpe);
    const winScore = r.winRate / 100;
    const mddScore = 1 - Math.min(Math.abs(r.maxDrawdown) / 100, 1);

    r.score = parseFloat((returnScore * 0.4 + sharpeScore * 0.3 + winScore * 0.2 + mddScore * 0.1).toFixed(4));
  }

  results.sort((a, b) => b.score - a.score);

  const best = results[0];
  log.info({ market, best: best.strategy, score: best.score, return: best.totalReturn }, '전략 매칭 완료');

  return {
    market,
    recommended: best.strategy,
    results,
    candles: candles.length,
  };
}

/**
 * 다수 마켓에 대해 최적 전략 일괄 매칭
 * @param {string[]} markets
 * @param {object} options
 * @returns {object} 마켓별 추천 전략
 */
async function matchAllMarkets(markets, options = {}) {
  const results = {};

  for (const market of markets) {
    try {
      results[market] = await matchStrategiesForMarket(market, options);
      // Upbit rate limit 방어
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      log.error({ market, err: err.message }, '전략 매칭 실패');
      results[market] = { market, error: err.message };
    }
  }

  // 요약
  const summary = Object.values(results)
    .filter((r) => r.recommended)
    .map((r) => ({
      market: r.market,
      strategy: r.recommended,
      score: r.results[0].score,
      return: r.results[0].totalReturn,
    }));

  return { results, summary };
}

module.exports = {
  matchStrategiesForMarket,
  matchAllMarkets,
  CANDIDATE_STRATEGIES,
};
