/**
 * P2-12 고급 기능 테스트 — Telegram, Binance, ML Bridge, Arbitrage
 */

// === Telegram ===
describe('Telegram 알림', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('isEnabled — 토큰/챗ID 없으면 false', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const tg = require('../src/utils/telegram');
    expect(tg.isEnabled()).toBe(false);
  });

  test('isEnabled — 토큰+챗ID 있으면 true', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'fake-token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    const tg = require('../src/utils/telegram');
    expect(tg.isEnabled()).toBe(true);
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  test('notifyTrade — 비활성 시 조용히 무시', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const tg = require('../src/utils/telegram');
    // Should not throw
    await tg.notifyTrade({ type: 'buy', market: 'KRW-BTC', price: 50000000 });
  });

  test('notifyAlert — 비활성 시 조용히 무시', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const tg = require('../src/utils/telegram');
    await tg.notifyAlert('warn', 'test');
  });
});

// === Binance ===
describe('Binance 커넥터', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('isEnabled — API 키 없으면 false', () => {
    delete process.env.BINANCE_API_KEY;
    const bn = require('../src/exchange/binance');
    expect(bn.isEnabled()).toBe(false);
  });

  test('isEnabled — API 키 있으면 true', () => {
    process.env.BINANCE_API_KEY = 'fake-key';
    process.env.BINANCE_SECRET_KEY = 'fake-secret';
    const bn = require('../src/exchange/binance');
    expect(bn.isEnabled()).toBe(true);
    delete process.env.BINANCE_API_KEY;
    delete process.env.BINANCE_SECRET_KEY;
  });

  test('exports 함수 목록', () => {
    const bn = require('../src/exchange/binance');
    expect(typeof bn.getTicker).toBe('function');
    expect(typeof bn.get24hStats).toBe('function');
    expect(typeof bn.getCandles).toBe('function');
    expect(typeof bn.getBalance).toBe('function');
    expect(typeof bn.marketOrder).toBe('function');
    expect(typeof bn.limitOrder).toBe('function');
    expect(typeof bn.cancelOrder).toBe('function');
  });
});

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

// === Arbitrage ===
describe('Arbitrage 모듈', () => {
  test('exports 함수 목록', () => {
    const arb = require('../src/engine/arbitrage');
    expect(typeof arb.getKimchiPremium).toBe('function');
    expect(typeof arb.scanPremiums).toBe('function');
  });
});
