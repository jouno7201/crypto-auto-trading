/**
 * 주문 실행 모듈 테스트 (페이퍼 모드)
 * - executeOrder 페이퍼: 즉시 filled 반환
 * - 수수료 계산 정확성
 * - 주문 내역 저장/조회
 */

// 페이퍼 모드 강제
process.env.TRADING_MODE = 'paper';

const path = require('path');
const fs = require('fs');

// 테스트용 data 디렉토리를 임시로 설정
const DATA_DIR = path.join(__dirname, '__test_data__');

// store 모듈이 실제 data/ 대신 테스트 디렉토리를 사용하도록 모킹
jest.mock('../src/store/jsonStore', () => {
  const _fs = require('fs');
  const _path = require('path');
  const dir = _path.join(__dirname, '__test_data__');
  if (!_fs.existsSync(dir)) _fs.mkdirSync(dir, { recursive: true });

  const memStore = {};
  return {
    load(filename, def = []) {
      return memStore[filename] || def;
    },
    save(filename, data) {
      memStore[filename] = data;
    },
    append(filename, item) {
      if (!memStore[filename]) memStore[filename] = [];
      memStore[filename].push({ ...item, createdAt: new Date().toISOString() });
      return memStore[filename];
    },
    _reset() {
      Object.keys(memStore).forEach((k) => delete memStore[k]);
    },
  };
});

// Upbit API 모킹 (시세 조회)
jest.mock('../src/api', () => ({
  upbit: {
    getTicker: jest.fn().mockResolvedValue([{ trade_price: 50_000_000 }]),
    order: jest.fn(),
    getOrder: jest.fn(),
    cancelOrder: jest.fn(),
  },
  binance: {},
}));

const { executeOrder, getOrders } = require('../src/engine/executor');
const store = require('../src/store/jsonStore');

describe('Executor (페이퍼 모드)', () => {
  beforeEach(() => {
    store._reset();
  });

  test('매수 주문 — filled + 수수료 공제', async () => {
    const order = await executeOrder('KRW-BTC', 'buy', { price: 100_000, amount: 100_000 });

    expect(order.status).toBe('filled');
    expect(order.mode).toBe('paper');
    expect(order.executedPrice).toBe(50_000_000);
    // 수수료 = 100000 * 0.0005 = 50
    expect(order.fee).toBeCloseTo(50, 0);
    // volume = (100000 - 50) / 50000000
    expect(order.executedVolume).toBeCloseTo(99_950 / 50_000_000, 10);
  });

  test('매도 주문 — proceeds 계산', async () => {
    const volume = 0.002;
    const order = await executeOrder('KRW-BTC', 'sell', { volume });

    expect(order.status).toBe('filled');
    // proceeds = volume * 50M * (1 - 0.0005) = 100000 - 50 = 99950
    const expectedProceeds = volume * 50_000_000 * (1 - 0.0005);
    expect(order.proceeds).toBeCloseTo(expectedProceeds, 0);
  });

  test('주문 내역 저장 → getOrders로 조회', async () => {
    await executeOrder('KRW-BTC', 'buy', { price: 100_000 });
    await executeOrder('KRW-ETH', 'buy', { price: 50_000 });

    const all = getOrders();
    expect(all.length).toBe(2);

    const btcOnly = getOrders({ market: 'KRW-BTC' });
    expect(btcOnly.length).toBe(1);
    expect(btcOnly[0].market).toBe('KRW-BTC');
  });

  test('주문 ID 형식', async () => {
    const order = await executeOrder('KRW-BTC', 'buy', { price: 100_000 });
    expect(order.id).toMatch(/^ORD-\d+-[a-z0-9]+$/);
  });
});
