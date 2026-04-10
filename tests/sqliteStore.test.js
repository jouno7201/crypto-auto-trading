/**
 * sqliteStore 테스트
 */
const path = require('path');
const fs = require('fs');

const TEST_DATA_DIR = path.join(__dirname, '__test_sqlite_data__');
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'test.db');

// Set env before requiring
if (!fs.existsSync(TEST_DATA_DIR)) fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
process.env.SQLITE_DATA_DIR = TEST_DATA_DIR;
process.env.SQLITE_DB_PATH = TEST_DB_PATH;

const store = require('../src/store/sqliteStore');

afterAll(() => {
  store.close();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  delete process.env.SQLITE_DATA_DIR;
  delete process.env.SQLITE_DB_PATH;
});

describe('sqliteStore', () => {
  describe('trades', () => {
    test('append and load trades', () => {
      store.append('trades.json', {
        type: 'buy',
        market: 'KRW-BTC',
        price: 50000000,
        volume: 0.001,
        amount: 50000,
        reason: 'test',
        strategy: 'macd',
      });

      store.append('trades.json', {
        type: 'sell',
        market: 'KRW-BTC',
        entryPrice: 50000000,
        exitPrice: 51000000,
        volume: 0.001,
        pnl: 1000,
        pnlPercent: 2.0,
        reason: 'tp',
        strategy: 'macd',
      });

      const trades = store.load('trades.json', []);
      expect(trades.length).toBe(2);
      expect(trades[0].type).toBe('buy');
      expect(trades[1].pnl).toBe(1000);
    });

    test('queryTrades with pagination', () => {
      const result = store.queryTrades({ limit: 1, offset: 0 });
      expect(result.rows.length).toBe(1);
      expect(result.total).toBe(2);
    });

    test('queryTrades with market filter', () => {
      const result = store.queryTrades({ market: 'KRW-BTC' });
      expect(result.total).toBe(2);
    });

    test('queryTrades with type filter', () => {
      const result = store.queryTrades({ type: 'sell' });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].pnl).toBe(1000);
    });

    test('tradeStats', () => {
      const stats = store.tradeStats();
      expect(stats).toBeDefined();
      expect(stats.totalPnl).toBe(1000);
    });
  });

  describe('orders', () => {
    test('append and load orders', () => {
      store.append('orders.json', {
        type: 'limit',
        market: 'KRW-BTC',
        side: 'bid',
        price: 50000000,
        volume: 0.001,
        status: 'done',
        mode: 'paper',
      });

      const orders = store.load('orders.json', []);
      expect(orders.length).toBe(1);
      expect(orders[0].market).toBe('KRW-BTC');
    });

    test('queryOrders with pagination', () => {
      const result = store.queryOrders({ limit: 10 });
      expect(result.total).toBe(1);
    });
  });

  describe('kv store (configs)', () => {
    test('save and load config', () => {
      store.save('bot-state.json', { running: true, capital: 1000000 });
      const data = store.load('bot-state.json');
      expect(data.running).toBe(true);
      expect(data.capital).toBe(1000000);
    });

    test('load missing key returns default', () => {
      const data = store.load('nonexistent.json', { empty: true });
      expect(data.empty).toBe(true);
    });

    test('save overwrites config', () => {
      store.save('test-config.json', { a: 1 });
      store.save('test-config.json', { a: 2, b: 3 });
      const data = store.load('test-config.json');
      expect(data.a).toBe(2);
      expect(data.b).toBe(3);
    });
  });

  describe('save trades (bulk overwrite)', () => {
    test('save replaces all trades', () => {
      store.save('trades.json', [{ type: 'buy', market: 'KRW-ETH', price: 4000000, volume: 0.1 }]);
      const trades = store.load('trades.json', []);
      expect(trades.length).toBe(1);
      expect(trades[0].market).toBe('KRW-ETH');
    });
  });
});
