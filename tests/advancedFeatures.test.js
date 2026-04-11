/**
 * P2-12 고급 기능 테스트 — ML Bridge
 */

// === ML Bridge ===
describe('ML Bridge', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('isAvailable — ML 서비스 없으면 false', async () => {
    const ml = require('../src/engine/mlBridge');
    const result = await ml.isAvailable();
    // localhost:5000 is not running → should be false
    expect(result).toBe(false);
  });

  test('predict — 서비스 없으면 fallback 반환', async () => {
    const ml = require('../src/engine/mlBridge');
    const result = await ml.predict('KRW-BTC', []);
    expect(result.prediction).toBe('hold');
    expect(result.confidence).toBe(0);
    expect(result.source).toBe('unavailable');
  });

  test('getSentiment — 서비스 없으면 fallback 반환', async () => {
    const ml = require('../src/engine/mlBridge');
    const result = await ml.getSentiment('KRW-BTC');
    expect(result.sentiment).toBe(0);
    expect(result.source).toBe('unavailable');
  });

  test('exports 함수 목록', () => {
    const ml = require('../src/engine/mlBridge');
    expect(typeof ml.isAvailable).toBe('function');
    expect(typeof ml.predict).toBe('function');
    expect(typeof ml.getSentiment).toBe('function');
    expect(typeof ml.trainModel).toBe('function');
  });
});
