/**
 * BotManager 단위 테스트
 */

jest.mock('../src/engine/tradingBot', () => {
  return class MockTradingBot {
    constructor(opts) {
      this.market = opts.market;
      this.strategyName = opts.strategyName || 'ma-cross';
      this.unit = opts.unit || '60';
      this.running = false;
      this.capital = opts.initialCapital || 1000000;
      this.tradeCount = 0;
      this.position = null;
      this.strategy = { name: this.strategyName };
      this.config = { strategyName: this.strategyName, unit: this.unit, intervalMs: 60000 };
    }
    start() { this.running = true; }
    stop() { this.running = false; }
    configure(cfg) {
      if (cfg.strategyName) this.strategyName = cfg.strategyName;
      return this.getStatus();
    }
    getStatus() {
      return {
        market: this.market,
        strategy: this.strategyName,
        running: this.running,
        capital: this.capital,
        tradeCount: this.tradeCount,
        position: this.position,
      };
    }
  };
});

// Mock jsonStore to avoid file I/O
jest.mock('../src/store/jsonStore', () => ({
  load: jest.fn(() => null),
  save: jest.fn(),
}));

const BotManager = require('../src/engine/botManager');

describe('BotManager', () => {
  let manager;

  beforeEach(() => {
    manager = new BotManager({ initialCapital: 500000 });
  });

  test('addBot — 봇 추가', () => {
    const bot = manager.addBot('KRW-BTC', { strategyName: 'macd' });
    expect(bot).toBeDefined();
    expect(bot.market).toBe('KRW-BTC');
    expect(manager.bots.size).toBe(1);
  });

  test('addBot — 중복 마켓 무시', () => {
    manager.addBot('KRW-BTC');
    manager.addBot('KRW-BTC');
    expect(manager.bots.size).toBe(1);
  });

  test('removeBot — 봇 제거', () => {
    manager.addBot('KRW-ETH');
    expect(manager.removeBot('KRW-ETH')).toBe(true);
    expect(manager.bots.size).toBe(0);
  });

  test('removeBot — 없는 마켓', () => {
    expect(manager.removeBot('KRW-SOL')).toBe(false);
  });

  test('getBot — 정상 조회', () => {
    manager.addBot('KRW-XRP');
    expect(manager.getBot('KRW-XRP')).toBeDefined();
    expect(manager.getBot('KRW-SOL')).toBeNull();
  });

  test('getMarkets — 마켓 목록', () => {
    manager.addBot('KRW-BTC');
    manager.addBot('KRW-ETH');
    const markets = manager.getMarkets();
    expect(markets).toContain('KRW-BTC');
    expect(markets).toContain('KRW-ETH');
    expect(markets.length).toBe(2);
  });

  test('startAll / stopAll', () => {
    manager.addBot('KRW-BTC');
    manager.addBot('KRW-ETH');
    manager.startAll();
    expect(manager.getRunningMarkets().length).toBe(2);
    manager.stopAll();
    expect(manager.getRunningMarkets().length).toBe(0);
  });

  test('startBot / stopBot — 개별 제어', () => {
    manager.addBot('KRW-BTC');
    expect(manager.startBot('KRW-BTC')).toBe(true);
    expect(manager.getRunningMarkets()).toContain('KRW-BTC');
    expect(manager.stopBot('KRW-BTC')).toBe(true);
    expect(manager.getRunningMarkets().length).toBe(0);
  });

  test('startBot — 없는 마켓', () => {
    expect(manager.startBot('KRW-SOL')).toBe(false);
  });

  test('configureBot — 설정 변경', () => {
    manager.addBot('KRW-BTC', { strategyName: 'rsi' });
    const status = manager.configureBot('KRW-BTC', { strategyName: 'macd' });
    expect(status).toBeDefined();
    expect(status.strategy).toBe('macd');
  });

  test('configureBot — 없는 마켓', () => {
    expect(manager.configureBot('KRW-SOL', {})).toBeNull();
  });

  test('getPortfolioStatus — 포트폴리오 집계', () => {
    manager.addBot('KRW-BTC');
    manager.addBot('KRW-ETH');
    const portfolio = manager.getPortfolioStatus();
    expect(portfolio.totalBots).toBe(2);
    expect(portfolio.totalCapital).toBe(1000000); // 2 * 500000
    expect(portfolio.bots.length).toBe(2);
  });

  test('getAllStatus — 전체 상태', () => {
    manager.addBot('KRW-BTC');
    const all = manager.getAllStatus();
    expect(Object.keys(all).length).toBe(1);
    expect(all['KRW-BTC']).toBeDefined();
    expect(all['KRW-BTC'].market).toBe('KRW-BTC');
  });
});
