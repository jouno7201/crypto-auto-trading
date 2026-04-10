/**
 * advancedAnalysis 테스트
 */

// Mock store - no out-of-scope variable references
const mockData = {};
jest.mock('../src/store/jsonStore', () => ({
  load: jest.fn((filename, defaultValue) => mockData[filename] || defaultValue),
  save: jest.fn((filename, data) => { mockData[filename] = data; }),
  DATA_DIR: __dirname + '/__test_data__',
}));

const store = require('../src/store/jsonStore');
const { monteCarlo, advancedMetrics, drawdownAnalysis, benchmarkComparison } = require('../src/engine/advancedAnalysis');

// 테스트용 매매 데이터 생성
function generateTrades(count, opts = {}) {
  const trades = [];
  const baseDate = new Date('2025-01-01');
  for (let i = 0; i < count; i++) {
    const day = new Date(baseDate);
    day.setDate(day.getDate() + Math.floor(i / 3)); // 하루에 ~3건
    const isWin = i % 3 !== 0; // 2/3 wins for determinism
    trades.push({
      id: `t-${i}`,
      type: 'sell',
      market: opts.market || 'KRW-BTC',
      strategy: opts.strategy || 'macd',
      pnl: isWin ? 10000 + i * 100 : -(5000 + i * 50),
      pnlPercent: isWin ? 2.0 : -1.0,
      reason: isWin ? 'tp' : 'sl',
      createdAt: day.toISOString(),
    });
  }
  return trades;
}

beforeEach(() => {
  // Reset mock data
  Object.keys(mockData).forEach(k => delete mockData[k]);
  mockData['trades.json'] = generateTrades(60);
});

describe('monteCarlo', () => {
  test('returns distribution with default params', () => {
    const result = monteCarlo({ simulations: 100 });
    expect(result.simulations).toBe(100);
    expect(result.distribution).toBeDefined();
    expect(result.distribution.mean).toBeDefined();
    expect(typeof result.distribution.p5).toBe('number');
    expect(typeof result.distribution.p95).toBe('number');
    expect(result.histogram.length).toBe(10);
    expect(typeof result.ruinProbability).toBe('number');
  });

  test('returns error with too few trades', () => {
    mockData['trades.json'] = [{ pnl: 100, createdAt: '2025-01-01' }];
    const result = monteCarlo();
    expect(result.error).toBeDefined();
  });

  test('respects market filter', () => {
    mockData['trades.json'] = [
      ...generateTrades(10, { market: 'KRW-BTC' }),
      ...generateTrades(10, { market: 'KRW-ETH' }),
    ];
    const result = monteCarlo({ simulations: 50, market: 'KRW-BTC' });
    expect(result.inputTrades).toBe(10);
  });
});

describe('advancedMetrics', () => {
  test('returns all metrics', () => {
    const result = advancedMetrics();
    expect(result.totalTrades).toBeGreaterThan(0);
    expect(typeof result.sharpeRatio).toBe('number');
    expect(typeof result.sortinoRatio).toBe('number');
    expect(typeof result.calmarRatio).toBe('number');
    expect(typeof result.profitFactor).toBe('number');
    expect(typeof result.winRate).toBe('number');
    expect(typeof result.expectancy).toBe('number');
  });

  test('returns error with no trades', () => {
    mockData['trades.json'] = [];
    const result = advancedMetrics();
    expect(result.error).toBeDefined();
  });
});

describe('drawdownAnalysis', () => {
  test('returns drawdown data', () => {
    const result = drawdownAnalysis();
    expect(result.timeline).toBeDefined();
    expect(result.timeline.length).toBeGreaterThan(0);
    expect(typeof result.totalDrawdowns).toBe('number');
    expect(typeof result.currentlyInDrawdown).toBe('boolean');
  });

  test('top drawdowns have causes', () => {
    const result = drawdownAnalysis({ topN: 3 });
    if (result.topDrawdowns && result.topDrawdowns.length > 0) {
      const dd = result.topDrawdowns[0];
      expect(dd.maxDrawdownPct).toBeGreaterThan(0);
      expect(dd.causes).toBeDefined();
      expect(dd.causes.byMarket).toBeDefined();
    }
  });
});

describe('benchmarkComparison', () => {
  test('returns strategy curve', () => {
    const result = benchmarkComparison();
    expect(result.strategy).toBeDefined();
    expect(result.strategy.curve.length).toBeGreaterThan(0);
    expect(typeof result.strategy.returnPct).toBe('number');
  });

  test('handles missing candle data', () => {
    const result = benchmarkComparison({ market: 'KRW-BTC' });
    expect(result.benchmark.available).toBe(false);
    expect(result.alpha).toBeNull();
  });

  test('compares with benchmark when candles available', () => {
    const candles = [];
    const base = new Date('2025-01-01');
    for (let i = 0; i < 30; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      candles.push({
        timestamp: d.toISOString(),
        trade_price: 50000000 + i * 500000,
      });
    }
    mockData['candles/KRW-BTC_day.json'] = candles;

    const result = benchmarkComparison({ market: 'KRW-BTC' });
    expect(result.benchmark.available).toBe(true);
    expect(typeof result.alpha).toBe('number');
    expect(typeof result.outperformed).toBe('boolean');
  });
});
