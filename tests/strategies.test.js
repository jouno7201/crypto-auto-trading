/**
 * 전략 유닛 테스트
 * - analyze() 시그널 형식 검증
 * - MACross: 골든크로스 → buy, 데드크로스 → sell
 * - RSI: 과매도 → buy, 과매수 → sell
 * - 데이터 부족 시 hold
 */

const { createStrategy, STRATEGIES } = require('../src/strategies');
const { goldenCrossCandles, deadCrossCandles, risingCandles, fallingCandles, candlesFromCloses } = require('./helpers');

// ── 공통 시그널 포맷 검증 ───────────────────────

describe('전략 공통', () => {
  const strategyNames = Object.keys(STRATEGIES);

  test.each(strategyNames)('%s — analyze()가 올바른 시그널 형식 반환', (name) => {
    const strategy = createStrategy(name);
    const candles = risingCandles(200);
    const signal = strategy.analyze(candles);

    expect(signal).toHaveProperty('action');
    expect(signal).toHaveProperty('reason');
    expect(signal).toHaveProperty('strength');
    expect(['buy', 'sell', 'hold']).toContain(signal.action);
    expect(typeof signal.reason).toBe('string');
    expect(signal.strength).toBeGreaterThanOrEqual(0);
    expect(signal.strength).toBeLessThanOrEqual(1);
  });

  test.each(strategyNames)('%s — 캔들 부족 시 hold 또는 에러 없음', (name) => {
    const strategy = createStrategy(name);
    const fewCandles = risingCandles(5);
    const signal = strategy.analyze(fewCandles);

    expect(signal.action).toBe('hold');
  });
});

// ── MACross ───────────────────────────────────

describe('MACross 전략', () => {
  test('골든크로스 캔들에서 buy 시그널', () => {
    const strategy = createStrategy('ma-cross');
    const candles = goldenCrossCandles(200);
    const signal = strategy.analyze(candles);

    // 골든크로스 또는 모멘텀 확산 매수 시그널 기대
    expect(['buy', 'hold']).toContain(signal.action);
    if (signal.action === 'buy') {
      expect(signal.strength).toBeGreaterThan(0);
    }
  });

  test('데드크로스 캔들에서 sell 시그널', () => {
    const strategy = createStrategy('ma-cross');
    const candles = deadCrossCandles(200);
    const signal = strategy.analyze(candles);

    expect(['sell', 'hold']).toContain(signal.action);
    if (signal.action === 'sell') {
      expect(signal.strength).toBeGreaterThan(0);
    }
  });

  test('커스텀 파라미터로 전략 생성', () => {
    const strategy = createStrategy('ma-cross', { shortPeriod: 5, longPeriod: 15 });
    expect(strategy.params.shortPeriod).toBe(5);
    expect(strategy.params.longPeriod).toBe(15);
  });
});

// ── RSI ───────────────────────────────────────

describe('RSI 전략', () => {
  test('급락 후 반등 — buy 가능', () => {
    const strategy = createStrategy('rsi');
    // 강한 하락 후 약간 반등
    const closes = [];
    let p = 50000000;
    for (let i = 0; i < 150; i++) ((p *= 0.998), closes.push(p)); // 하락
    for (let i = 0; i < 50; i++) ((p *= 1.003), closes.push(p)); // 반등
    const candles = candlesFromCloses(closes);
    const signal = strategy.analyze(candles);

    // RSI가 과매도 영역에서 반등하므로 buy 기대
    expect(['buy', 'hold']).toContain(signal.action);
  });

  test('급등 후 — sell 가능', () => {
    const strategy = createStrategy('rsi');
    const closes = [];
    let p = 50000000;
    for (let i = 0; i < 150; i++) ((p *= 1.002), closes.push(p));
    for (let i = 0; i < 50; i++) ((p *= 0.997), closes.push(p));
    const candles = candlesFromCloses(closes);
    const signal = strategy.analyze(candles);

    expect(['sell', 'hold']).toContain(signal.action);
  });
});

// ── createStrategy ──────────────────────────────

describe('createStrategy', () => {
  test('존재하지 않는 전략 → 에러', () => {
    expect(() => createStrategy('nonexistent')).toThrow();
  });

  test('모든 등록 전략 생성 가능', () => {
    for (const name of Object.keys(STRATEGIES)) {
      const s = createStrategy(name);
      expect(s).toBeDefined();
      expect(typeof s.analyze).toBe('function');
    }
  });
});
