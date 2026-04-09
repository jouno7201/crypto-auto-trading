/**
 * 워크포워드 검증 엔진
 * - 데이터를 훈련(in-sample) / 검증(out-of-sample) 구간으로 분할
 * - 훈련 구간에서 파라미터 최적화 → 검증 구간에서 성과 측정
 * - 과최적화(overfitting) 방지를 위한 핵심 기법
 */

const { runBacktest } = require('./backtest');

/**
 * 파라미터 그리드 생성
 * @param {Object} grid - { paramName: [val1, val2, ...], ... }
 * @returns {Array<Object>} 모든 조합 배열
 */
function generateGrid(grid) {
  const keys = Object.keys(grid);
  if (keys.length === 0) return [{}];

  const combos = [{}];
  for (const key of keys) {
    const values = grid[key];
    const next = [];
    for (const combo of combos) {
      for (const val of values) {
        next.push({ ...combo, [key]: val });
      }
    }
    combos.length = 0;
    combos.push(...next);
  }
  return combos;
}

/**
 * 기본 최적화 그리드 (엔진 파라미터)
 */
const DEFAULT_ENGINE_GRID = {
  stopLossATR: [1.5, 2.0, 3.0],
  takeProfitATR: [3.0, 5.0, 8.0],
  trailingStopATR: [0, 3.0, 4.0],
  riskPerTrade: [0.2, 0.3],
  minHoldBars: [0, 2],
};

/**
 * 전략별 기본 최적화 그리드
 */
const STRATEGY_PARAM_GRIDS = {
  'ma-cross': {
    shortPeriod: [5, 9, 14],
    longPeriod: [21, 30, 50],
  },
  rsi: {
    period: [10, 14],
    oversold: [30, 35],
    overbought: [65, 70],
  },
  bollinger: {
    period: [15, 20],
    multiplier: [1.5, 2.0, 2.5],
  },
  macd: {
    fastPeriod: [8, 12],
    slowPeriod: [21, 26],
    signalPeriod: [7, 9],
  },
  'triple-ema': {
    fast: [7, 9],
    mid: [15, 21],
    slow: [45, 55],
  },
  'mean-reversion': {
    emaPeriod: [15, 20],
    keltnerMult: [1.2, 1.5, 2.0],
    deviationThreshold: [1.2, 1.5, 2.0],
  },
  'adaptive-momentum': {
    rocPeriod: [7, 10, 14],
    rocSmooth: [3, 5],
    adxThreshold: [18, 22],
  },
};

/**
 * 워크포워드 검증 실행
 *
 * @param {Function} createStrategyFn - (name, params) => strategy 인스턴스
 * @param {string} strategyName - 전략 이름
 * @param {Array} candles - 전체 캔들 데이터
 * @param {Object} config
 * @param {number} config.windows - 워크포워드 윈도우 수 (기본 4)
 * @param {number} config.trainRatio - 훈련 비율 (기본 0.7)
 * @param {number} config.initialCapital - 초기 자본
 * @param {boolean} config.allowShort - 숏 허용
 * @param {boolean} config.useMarketDetector - 시장감지 사용
 * @param {boolean} config.optimizeStrategy - 전략 파라미터도 최적화 (기본 false)
 * @param {Object} config.engineGrid - 엔진 파라미터 그리드 (커스텀)
 * @param {Object} config.strategyGrid - 전략 파라미터 그리드 (커스텀)
 * @param {string} config.metric - 최적화 지표 ('sharpe' | 'return' | 'calmar')
 * @param {Function} config.onProgress - 진행 콜백 (percent, message)
 * @returns {Object} 워크포워드 결과
 */
function runWalkForward(createStrategyFn, strategyName, candles, config = {}) {
  const {
    windows = 4,
    trainRatio = 0.7,
    initialCapital = 1_000_000,
    allowShort = false,
    useMarketDetector = true,
    optimizeStrategy = false,
    engineGrid = DEFAULT_ENGINE_GRID,
    strategyGrid = null,
    metric = 'calmar',
    onProgress = null,
  } = config;

  const totalCandles = candles.length;
  if (totalCandles < 200) {
    throw new Error(`캔들 데이터 부족: 최소 200개 필요 (현재 ${totalCandles}개)`);
  }

  // ===== 앵커드 워크포워드: 윈도우 분할 =====
  // 각 윈도우의 test 크기는 동일, train은 점진적으로 증가 (anchored) 또는 고정 (rolling)
  // 여기서는 rolling 방식 사용: 각 윈도우 크기 동일
  const windowSize = Math.floor(totalCandles / windows);
  const trainSize = Math.floor(windowSize * trainRatio);
  const testSize = windowSize - trainSize;

  if (trainSize < 100) {
    throw new Error(`훈련 구간이 너무 짧음: ${trainSize}개 (최소 100개 필요). 데이터를 늘리거나 윈도우 수를 줄이세요.`);
  }

  // 전략 파라미터 그리드 결정
  const sGrid = optimizeStrategy ? strategyGrid || STRATEGY_PARAM_GRIDS[strategyName] || {} : {};
  const eGrid = engineGrid;

  // 모든 조합 생성
  const engineCombos = generateGrid(eGrid);
  const strategyCombos = generateGrid(sGrid);
  const totalCombos = engineCombos.length * strategyCombos.length;

  const windowResults = [];
  let totalProgress = 0;
  const totalWork = windows * totalCombos;

  for (let w = 0; w < windows; w++) {
    const winStart = w * windowSize;
    const trainStart = winStart;
    const trainEnd = winStart + trainSize;
    const testStart = trainEnd;
    const testEnd = Math.min(winStart + windowSize, totalCandles);

    const trainCandles = candles.slice(trainStart, trainEnd);
    const testCandles = candles.slice(testStart, testEnd);

    if (onProgress) {
      onProgress(
        Math.round((totalProgress / totalWork) * 100),
        `윈도우 ${w + 1}/${windows} 훈련 중 (${totalCombos}개 조합)`,
      );
    }

    // ===== 훈련 (In-Sample): 최적 파라미터 찾기 =====
    let bestScore = -Infinity;
    let bestEngineParams = {};
    let bestStrategyParams = {};
    let bestTrainResult = null;

    for (const eComb of engineCombos) {
      for (const sComb of strategyCombos) {
        totalProgress++;

        const strategy = createStrategyFn(strategyName, sComb);
        const btOpts = {
          initialCapital,
          allowShort,
          useMarketDetector,
          ...eComb,
        };

        try {
          const result = runBacktest(strategy, trainCandles, btOpts);
          const score = calculateScore(result, metric);

          if (score > bestScore) {
            bestScore = score;
            bestEngineParams = eComb;
            bestStrategyParams = sComb;
            bestTrainResult = result;
          }
        } catch {
          // 파라미터 조합 오류 → 건너뜀
        }
      }
    }

    // ===== 검증 (Out-of-Sample): 최적 파라미터로 테스트 =====
    const testStrategy = createStrategyFn(strategyName, bestStrategyParams);
    const testOpts = {
      initialCapital,
      allowShort,
      useMarketDetector,
      ...bestEngineParams,
    };

    const testResult = runBacktest(testStrategy, testCandles, testOpts);

    windowResults.push({
      window: w + 1,
      period: {
        train: {
          start: trainCandles[0]?.timestamp,
          end: trainCandles[trainCandles.length - 1]?.timestamp,
          candles: trainCandles.length,
        },
        test: {
          start: testCandles[0]?.timestamp,
          end: testCandles[testCandles.length - 1]?.timestamp,
          candles: testCandles.length,
        },
      },
      bestParams: {
        engine: bestEngineParams,
        strategy: bestStrategyParams,
      },
      train: {
        totalReturn: bestTrainResult?.performance.totalReturn ?? 0,
        maxDrawdown: bestTrainResult?.performance.maxDrawdown ?? 0,
        sharpe: bestTrainResult?.performance.sharpeRatio ?? 0,
        trades: bestTrainResult?.trades.total ?? 0,
        winRate: bestTrainResult?.trades.winRate ?? 0,
      },
      test: {
        totalReturn: testResult.performance.totalReturn,
        maxDrawdown: testResult.performance.maxDrawdown,
        sharpe: testResult.performance.sharpeRatio,
        profitFactor: testResult.performance.profitFactor,
        trades: testResult.trades.total,
        winRate: testResult.trades.winRate,
        finalCapital: testResult.performance.finalCapital,
      },
      testTradeLog: testResult.tradeLog,
      testEquityCurve: testResult.equityCurve,
    });

    if (onProgress) {
      onProgress(
        Math.round(((w + 1) / windows) * 100),
        `윈도우 ${w + 1}/${windows} 완료 — OOS 수익률: ${testResult.performance.totalReturn.toFixed(2)}%`,
      );
    }
  }

  // ===== 종합 통계 =====
  const oosReturns = windowResults.map((w) => w.test.totalReturn);
  const isReturns = windowResults.map((w) => w.train.totalReturn);
  const oosDrawdowns = windowResults.map((w) => w.test.maxDrawdown);

  // OOS 자본 연쇄 시뮬레이션 (윈도우 순서대로)
  let chainedCapital = initialCapital;
  const chainedEquity = [];
  for (const wr of windowResults) {
    const startCap = chainedCapital;
    chainedCapital = startCap * (1 + wr.test.totalReturn / 100);
    chainedEquity.push({
      window: wr.window,
      start: startCap,
      end: chainedCapital,
      return: wr.test.totalReturn,
    });
  }

  const avgOOS = mean(oosReturns);
  const avgIS = mean(isReturns);
  const robustness = avgIS !== 0 ? (avgOOS / avgIS) * 100 : 0;
  const consistencyRatio = oosReturns.filter((r) => r > 0).length / oosReturns.length;
  const avgOOSDrawdown = mean(oosDrawdowns);
  const worstOOSDrawdown = Math.min(...oosDrawdowns.map((d) => -Math.abs(d)));

  const summary = {
    strategy: strategyName,
    windows,
    trainRatio,
    metric,
    totalCombosPerWindow: totalCombos,
    optimizeStrategy,
    initialCapital,
    // OOS 종합 성과
    oos: {
      avgReturn: round2(avgOOS),
      totalChainedReturn: round2(((chainedCapital - initialCapital) / initialCapital) * 100),
      chainedFinalCapital: Math.round(chainedCapital),
      avgDrawdown: round2(avgOOSDrawdown),
      worstDrawdown: round2(worstOOSDrawdown),
      avgWinRate: round2(mean(windowResults.map((w) => w.test.winRate))),
      avgSharpe: round2(mean(windowResults.map((w) => w.test.sharpe))),
      avgProfitFactor: round2(finiteMean(windowResults.map((w) => w.test.profitFactor))),
      totalTrades: windowResults.reduce((s, w) => s + w.test.trades, 0),
    },
    // 견고성 분석
    analysis: {
      robustnessRatio: round2(robustness), // IS 대비 OOS 성능 (100% 이상 = 견고)
      consistencyRatio: round2(consistencyRatio * 100), // OOS 양수 비율
      isAvgReturn: round2(avgIS),
      returnDegradation: round2(avgIS - avgOOS), // IS→OOS 수익률 감소
      verdict: getVerdict(robustness, consistencyRatio, avgOOS),
    },
    chainedEquity,
    windowDetails: windowResults,
  };

  return summary;
}

// ===== 헬퍼 함수 =====

function calculateScore(result, metric) {
  const perf = result.performance;
  const maxDD = Math.abs(perf.maxDrawdown) || 0.01;

  switch (metric) {
    case 'sharpe':
      return perf.sharpeRatio || 0;
    case 'return':
      return perf.totalReturn || 0;
    case 'calmar':
    default:
      // Calmar 비율: 수익률 / 최대 손실폭
      return perf.totalReturn / maxDD;
  }
}

function mean(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function finiteMean(arr) {
  const finite = arr.filter((v) => Number.isFinite(v));
  return finite.length > 0 ? finite.reduce((a, b) => a + b, 0) / finite.length : 0;
}

function round2(v) {
  return parseFloat(v.toFixed(2));
}

function getVerdict(robustness, consistency, avgReturn) {
  if (avgReturn > 0 && robustness >= 70 && consistency >= 0.75) {
    return '✅ 견고 (Robust) — 실전 적용 가능';
  }
  if (avgReturn > 0 && robustness >= 40 && consistency >= 0.5) {
    return '⚠️ 보통 (Moderate) — 추가 검증 필요';
  }
  if (avgReturn <= 0) {
    return '❌ 부적합 (Unprofitable) — OOS 수익률 음수';
  }
  return '❌ 과최적화 의심 (Overfit) — IS/OOS 괴리 큼';
}

module.exports = {
  runWalkForward,
  generateGrid,
  DEFAULT_ENGINE_GRID,
  STRATEGY_PARAM_GRIDS,
};
