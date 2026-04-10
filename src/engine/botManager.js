/**
 * 멀티마켓 봇 매니저
 * - 마켓별 독립 TradingBot 인스턴스 관리
 * - 포트폴리오 전체 상태 집계
 * - 마켓별 상태 저장/복원
 */

const TradingBot = require('./tradingBot');
const store = require('../store/jsonStore');
const { createLogger } = require('../utils/logger');

const log = createLogger('bot-manager');

const DEFAULT_MARKETS = [{ market: 'KRW-BTC', strategyName: 'ensemble', unit: '60' }];

class BotManager {
  constructor(globalConfig = {}) {
    this.globalConfig = {
      intervalMs: 60 * 1000,
      initialCapital: 1_000_000,
      ...globalConfig,
    };
    /** @type {Map<string, TradingBot>} */
    this.bots = new Map();

    // 저장된 멀티봇 구성 복원
    this._restoreConfig();
  }

  /**
   * 마켓별 봇 추가 (이미 존재하면 무시)
   */
  addBot(market, options = {}) {
    if (this.bots.has(market)) {
      log.warn({ market }, '이미 등록된 마켓');
      return this.bots.get(market);
    }

    const bot = new TradingBot({
      market,
      strategyName: options.strategyName || 'ensemble',
      strategyParams: options.strategyParams || {},
      unit: options.unit || '60',
      intervalMs: options.intervalMs || this.globalConfig.intervalMs,
      initialCapital: options.initialCapital || this.globalConfig.initialCapital,
      risk: options.risk,
    });

    this.bots.set(market, bot);
    log.info({ market, strategy: bot.strategy.name }, '봇 추가');
    this._saveConfig();
    return bot;
  }

  /**
   * 마켓별 봇 제거 (실행 중이면 정지 후 제거)
   */
  removeBot(market) {
    const bot = this.bots.get(market);
    if (!bot) return false;

    if (bot.running) bot.stop();
    this.bots.delete(market);
    log.info({ market }, '봇 제거');
    this._saveConfig();
    return true;
  }

  /**
   * 특정 마켓 봇 가져오기
   */
  getBot(market) {
    return this.bots.get(market) || null;
  }

  /**
   * 전체 봇 시작
   */
  startAll() {
    for (const [market, bot] of this.bots) {
      if (!bot.running) {
        bot.start();
        log.info({ market }, '봇 시작');
      }
    }
  }

  /**
   * 전체 봇 정지
   */
  stopAll() {
    for (const [market, bot] of this.bots) {
      if (bot.running) {
        bot.stop();
        log.info({ market }, '봇 정지');
      }
    }
  }

  /**
   * 특정 마켓 봇 시작
   */
  startBot(market) {
    const bot = this.bots.get(market);
    if (!bot) return false;
    bot.start();
    return true;
  }

  /**
   * 특정 마켓 봇 정지
   */
  stopBot(market) {
    const bot = this.bots.get(market);
    if (!bot) return false;
    bot.stop();
    return true;
  }

  /**
   * 특정 마켓 봇 설정 변경
   */
  configureBot(market, config) {
    const bot = this.bots.get(market);
    if (!bot) return null;
    const status = bot.configure(config);
    this._saveConfig();
    return status;
  }

  /**
   * 전체 포트폴리오 상태 (집계)
   */
  getPortfolioStatus() {
    const bots = [];
    let totalCapital = 0;
    let totalPositionValue = 0;
    let totalTrades = 0;
    let runningCount = 0;

    for (const [market, bot] of this.bots) {
      const status = bot.getStatus();
      const posValue = status.position ? status.position.volume * status.position.entryPrice : 0;

      bots.push({
        market,
        ...status,
        positionValue: posValue,
      });

      totalCapital += status.capital;
      totalPositionValue += posValue;
      totalTrades += status.tradeCount;
      if (status.running) runningCount++;
    }

    return {
      totalBots: this.bots.size,
      runningBots: runningCount,
      totalCapital: Math.round(totalCapital),
      totalPositionValue: Math.round(totalPositionValue),
      totalAssets: Math.round(totalCapital + totalPositionValue),
      totalTrades,
      bots,
    };
  }

  /**
   * 전체 봇 개별 상태 목록
   */
  getAllStatus() {
    const result = {};
    for (const [market, bot] of this.bots) {
      result[market] = bot.getStatus();
    }
    return result;
  }

  /**
   * 활성 마켓 목록
   */
  getMarkets() {
    return Array.from(this.bots.keys());
  }

  /**
   * 실행 중인 마켓 목록
   */
  getRunningMarkets() {
    return Array.from(this.bots.entries())
      .filter(([, bot]) => bot.running)
      .map(([market]) => market);
  }

  /**
   * 멀티봇 구성 저장
   */
  _saveConfig() {
    const configs = [];
    for (const [market, bot] of this.bots) {
      configs.push({
        market,
        strategyName: bot.config.strategyName,
        strategyParams: bot.config.strategyParams,
        unit: bot.config.unit,
        intervalMs: bot.config.intervalMs,
        initialCapital: bot.config.initialCapital,
        running: bot.running,
      });
    }
    store.save('bot-manager.json', { configs, savedAt: new Date().toISOString() });
  }

  /**
   * 멀티봇 구성 복원
   */
  _restoreConfig() {
    try {
      const saved = store.load('bot-manager.json', null);
      if (!saved || !saved.configs || saved.configs.length === 0) return;

      for (const cfg of saved.configs) {
        this.addBot(cfg.market, {
          strategyName: cfg.strategyName,
          strategyParams: cfg.strategyParams,
          unit: cfg.unit,
          intervalMs: cfg.intervalMs,
          initialCapital: cfg.initialCapital,
        });
      }
      log.info({ count: saved.configs.length }, '멀티봇 구성 복원');
    } catch (err) {
      log.warn({ err: err.message }, '멀티봇 구성 복원 실패');
    }
  }
}

module.exports = BotManager;
