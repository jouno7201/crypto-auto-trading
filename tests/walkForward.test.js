const { runWalkForward } = require('../src/engine/walkForward');

function makeCandles(length = 600) {
  return Array.from({ length }, (_, index) => {
    const base = 100 + index * 0.2;
    return {
      timestamp: new Date(2025, 0, 1, index).toISOString(),
      open: base,
      high: base + 1,
      low: base - 1,
      close: base,
    };
  });
}

function createSellOnlyStrategy(name, params = {}) {
  return {
    name,
    params,
    analyze(window) {
      return window.length > 70 ? { action: 'sell', strength: 1 } : { action: 'hold', strength: 0 };
    },
  };
}

describe('runWalkForward short handling', () => {
  test('marks spot-only runs and blocks short trades when allowShort is false', () => {
    const result = runWalkForward(createSellOnlyStrategy, 'sell-only', makeCandles(), {
      windows: 2,
      trainRatio: 0.7,
      allowShort: false,
      useMarketDetector: false,
      optimizeStrategy: false,
    });

    expect(result.constraints).toEqual({
      allowShort: false,
      useMarketDetector: false,
      executionMode: 'spot-only',
    });
    expect(result.oos.shortTrades).toBe(0);
    expect(result.analysis.spotCompatible).toBe(true);
    expect(result.windowDetails.every((window) => window.test.shortTrades === 0)).toBe(true);
  });

  test('reports short trades when allowShort is true', () => {
    const result = runWalkForward(createSellOnlyStrategy, 'sell-only', makeCandles(), {
      windows: 2,
      trainRatio: 0.7,
      allowShort: true,
      useMarketDetector: false,
      optimizeStrategy: false,
    });

    expect(result.constraints).toEqual({
      allowShort: true,
      useMarketDetector: false,
      executionMode: 'long-short',
    });
    expect(result.oos.shortTrades).toBeGreaterThan(0);
    expect(result.analysis.spotCompatible).toBe(false);
    expect(result.windowDetails.some((window) => window.test.shortTrades > 0)).toBe(true);
  });
});
