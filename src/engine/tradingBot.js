/**
 * 매매 스케줄러 (트레이딩 봇 코어)
 * - 전략 엔진 → 시그널 발생 → 리스크 체크 → 주문 실행
 * - 루프 기반 자동 매매
 * - 전략별 ON/OFF
 * - 페이퍼 트레이딩 모드
 */

const { fetchUpbitCandles } = require('./dataCollector');
const { executeWithRetry } = require('./executor');
const RiskManager = require('./riskManager');
const { createStrategy } = require('../strategies');
const store = require('../store/jsonStore');
const notify = require('./notifier');
const { createLogger } = require('../utils/logger');

const log = createLogger('bot');

class TradingBot {
  constructor(config = {}) {
    this.config = {
      market: 'KRW-BTC',
      strategyName: 'ma-cross',
      strategyParams: {},
      unit: '60', // 캔들 단위 (분)
      candleCount: 200, // 분석할 캔들 수
      intervalMs: 60 * 1000, // 실행 간격 (기본 1분)
      initialCapital: 1_000_000,
      ...config,
    };

    this.strategy = createStrategy(this.config.strategyName, this.config.strategyParams);
    this.riskManager = new RiskManager(config.risk || {});
    this.running = false;
    this.intervalId = null;

    // 포지션 상태
    this.position = null; // { market, side, entryPrice, volume, entryTime }
    this.capital = this.config.initialCapital;
    this.tradeCount = 0;
    this.consecutiveErrors = 0;

    // 이전 상태 복원 시도
    this._restoreState();

    // 일일 시작 자본 설정
    this.riskManager.setDailyStart(this.capital);
  }

  /**
   * 봇 시작
   */
  start() {
    if (this.running) {
      log.warn('봇이 이미 실행 중');
      return;
    }

    this.running = true;
    log.info(
      {
        market: this.config.market,
        strategy: this.strategy.name,
        mode: process.env.TRADING_MODE || 'paper',
        interval: this.config.intervalMs / 1000,
        capital: this.capital,
      },
      '트레이딩 봇 시작',
    );

    // 봇 시작 알림
    notify.notifyBotStart({
      market: this.config.market,
      strategy: this.strategy.name,
      mode: process.env.TRADING_MODE || 'paper',
      capital: this.capital,
    });

    // 즉시 한 번 실행 후 인터벌
    this.tick();
    this.intervalId = setInterval(() => this.tick(), this.config.intervalMs);

    // 주기적 상태 저장 (5분마다)
    this._stateTimer = setInterval(() => this._saveState(), 5 * 60 * 1000);

    // 일일 리포트 (매일 09:00)
    this._scheduleDailyReport();
  }

  /**
   * 봇 정지
   */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    log.info('트레이딩 봇 정지');
    this._saveState();
    if (this._dailyTimer) {
      clearTimeout(this._dailyTimer);
      this._dailyTimer = null;
    }
    if (this._stateTimer) {
      clearInterval(this._stateTimer);
      this._stateTimer = null;
    }
    notify.notifyBotStop({
      market: this.config.market,
      capital: this.capital,
      tradeCount: this.tradeCount,
    });
  }

  /**
   * 매매 루프 1회 실행
   */
  async tick() {
    if (!this.running) return;

    try {
      const { market, unit, candleCount } = this.config;

      // 1. 데이터 수집
      const candles = await fetchUpbitCandles(market, unit, candleCount);
      const currentPrice = candles[candles.length - 1].close;
      const timestamp = candles[candles.length - 1].timestamp;

      // 2. 리스크 체크
      const positions = this.position
        ? [{ market: this.position.market, value: this.position.volume * currentPrice }]
        : [];
      const riskCheck = this.riskManager.canTrade(this.capital, positions);

      // 3. 포지션 손절/익절 체크
      if (this.position) {
        const exitCheck = this.riskManager.checkExit(this.position.entryPrice, currentPrice);
        if (exitCheck.shouldExit) {
          log.info({ reason: exitCheck.reason }, '손절/익절 매도 실행');
          await this._sell(currentPrice, exitCheck.reason);
          return;
        }
      }

      // 4. 전략 시그널 분석
      const signal = this.strategy.analyze(candles);

      // 로그 출력
      log.debug({ timestamp, price: currentPrice, signal: signal.action, position: !!this.position }, '틱 분석');

      // 연속 에러 카운터 리셋
      this.consecutiveErrors = 0;

      // 5. 시그널에 따른 주문 실행
      if (signal.action === 'buy' && !this.position) {
        if (!riskCheck.allowed) {
          log.info({ reason: riskCheck.reason }, '매수 스킵 (리스크)');
          return;
        }

        const sizing = this.riskManager.calculatePositionSize(this.capital, currentPrice, positions);
        if (sizing.investAmount < 5000) {
          log.info('매수 스킵: 최소 주문금액 미달');
          return;
        }

        log.info({ reason: signal.reason, strength: signal.strength }, '매수 시그널');
        await this._buy(currentPrice, sizing.investAmount, signal.reason);
      }

      if (signal.action === 'sell' && this.position) {
        log.info({ reason: signal.reason, strength: signal.strength }, '매도 시그널');
        await this._sell(currentPrice, signal.reason);
      }
    } catch (err) {
      this.consecutiveErrors++;
      log.error({ err, consecutiveErrors: this.consecutiveErrors }, '틱 처리 에러');
      notify.notifyError({ context: 'tick()', message: err.message });

      // 연속 에러 5회 이상이면 봇 자동 정지 (네트워크 장애 등)
      if (this.consecutiveErrors >= 5) {
        log.fatal({ consecutiveErrors: this.consecutiveErrors }, '연속 에러 한도 초과 — 봇 자동 정지');
        notify.notifyError({ context: 'auto-stop', message: `연속 ${this.consecutiveErrors}회 에러로 봇 자동 정지` });
        this.stop();
      }
    }
  }

  /**
   * 매수 실행
   */
  async _buy(price, amount, reason) {
    const order = await executeWithRetry(this.config.market, 'buy', { price: amount, amount });

    if (order && (order.status === 'filled' || order.status === 'partial_filled')) {
      const actualVolume = order.executedVolume || amount / price;
      const actualPrice = order.executedPrice || price;
      const actualAmount = order.fee != null ? actualVolume * actualPrice + order.fee : amount;

      this.position = {
        market: this.config.market,
        entryPrice: actualPrice,
        volume: actualVolume,
        entryTime: new Date().toISOString(),
        reason,
      };
      this.capital -= Math.min(actualAmount, amount);
      this.tradeCount++;

      if (order.status === 'partial_filled') {
        log.warn({ requestedAmount: amount, actualVolume }, '부분 매수 체결');
      }

      const exits = this.riskManager.getExitPrices(this.position.entryPrice);
      log.info(
        {
          price: this.position.entryPrice,
          amount,
          stopLoss: exits.stopLoss,
          takeProfit: exits.takeProfit,
        },
        '매수 체결',
      );

      notify.notifyBuy({
        market: this.config.market,
        price: this.position.entryPrice,
        amount,
        reason,
        strategy: this.strategy.name,
        stopLoss: exits.stopLoss,
        takeProfit: exits.takeProfit,
      });

      store.append('trades.json', {
        type: 'buy',
        market: this.config.market,
        price: this.position.entryPrice,
        volume: this.position.volume,
        amount,
        reason,
        strategy: this.strategy.name,
      });

      this._saveState();
    }
  }

  /**
   * 매도 실행
   */
  async _sell(price, reason) {
    if (!this.position) return;

    const order = await executeWithRetry(this.config.market, 'sell', { volume: this.position.volume });

    if (order && (order.status === 'filled' || order.status === 'partial_filled')) {
      const exitPrice = order.executedPrice || price;
      const proceeds = order.proceeds || this.position.volume * exitPrice * 0.9995;
      const pnl = proceeds - this.position.volume * this.position.entryPrice;
      const pnlPercent = (((exitPrice - this.position.entryPrice) / this.position.entryPrice) * 100).toFixed(2);

      this.capital += proceeds;

      // 부분 체결 시 잔량 포지션 유지
      if (order.status === 'partial_filled' && order.remainingVolume > 0) {
        this.position.volume = order.remainingVolume;
        log.warn({ remainingVolume: order.remainingVolume }, '부분 매도 체결 — 잔량 포지션 유지');
      } else {
        this.position = null;
      }

      log.info(
        {
          exitPrice,
          pnl: Math.round(pnl),
          pnlPercent,
          reason,
        },
        pnl >= 0 ? '매도 체결 (이익)' : '매도 체결 (손실)',
      );

      notify.notifySell({
        market: this.config.market,
        entryPrice: this.position.entryPrice,
        exitPrice,
        pnl: Math.round(pnl),
        pnlPercent,
        reason,
        strategy: this.strategy.name,
      });

      store.append('trades.json', {
        type: 'sell',
        market: this.config.market,
        entryPrice: this.position?.entryPrice || price,
        exitPrice,
        volume: this.position.volume,
        pnl: Math.round(pnl),
        pnlPercent: parseFloat(pnlPercent),
        reason,
        strategy: this.strategy.name,
      });

      this._saveState();
    }
  }

  /**
   * 이전 상태 복원 (재시작 시 포지션 보호)
   */
  _restoreState() {
    try {
      const saved = store.load('bot-state.json', null);
      if (!saved) return;

      // 같은 마켓/전략인 경우만 복원
      if (saved.config?.market !== this.config.market) return;

      if (saved.position) {
        this.position = saved.position;
        log.info(
          {
            market: saved.position.market,
            entryPrice: saved.position.entryPrice,
            volume: saved.position.volume,
          },
          '기존 포지션 복원',
        );
      }
      if (saved.capital) this.capital = saved.capital;
      if (saved.tradeCount) this.tradeCount = saved.tradeCount;
    } catch (err) {
      log.warn({ err: err.message }, '상태 복원 실패 — 기본값 사용');
    }
  }

  /**
   * 상태 저장
   */
  _saveState() {
    store.save('bot-state.json', {
      config: this.config,
      capital: this.capital,
      position: this.position,
      tradeCount: this.tradeCount,
      running: this.running,
      savedAt: new Date().toISOString(),
    });
  }

  /**
   * 일일 리포트 스케줄러 (매일 09:00)
   */
  _scheduleDailyReport() {
    const now = new Date();
    const next9am = new Date(now);
    next9am.setHours(9, 0, 0, 0);
    if (now >= next9am) next9am.setDate(next9am.getDate() + 1);
    const delay = next9am - now;

    this._dailyTimer = setTimeout(() => {
      notify.notifyDailyReport({
        market: this.config.market,
        capital: this.capital,
        initialCapital: this.config.initialCapital,
        todayPnl: null,
        todayTrades: 0,
        position: this.position,
      });
      // 다음 날 재스케줄
      if (this.running) this._scheduleDailyReport();
    }, delay);
  }

  /**
   * 현재 상태 조회
   */
  getStatus() {
    return {
      running: this.running,
      strategy: this.strategy.name,
      strategyName: this.config.strategyName,
      market: this.config.market,
      unit: this.config.unit,
      mode: process.env.TRADING_MODE || 'paper',
      capital: this.capital,
      position: this.position,
      tradeCount: this.tradeCount,
      risk: this.riskManager.getStatus(
        this.capital,
        this.position ? [{ value: this.position.volume * this.position.entryPrice }] : [],
      ),
    };
  }

  /**
   * 봇 설정 변경 (실행 중이면 재시작)
   */
  configure({ market, strategyName, strategyParams, unit }) {
    const wasRunning = this.running;
    if (wasRunning) this.stop();

    if (market) this.config.market = market;
    if (strategyName) {
      this.config.strategyName = strategyName;
      this.config.strategyParams = strategyParams || {};
      this.strategy = createStrategy(strategyName, this.config.strategyParams);
    } else if (strategyParams) {
      this.config.strategyParams = strategyParams;
      this.strategy = createStrategy(this.config.strategyName, strategyParams);
    }
    if (unit) this.config.unit = unit;

    log.info({ market: this.config.market, strategy: this.strategy.name, unit: this.config.unit }, '봇 설정 변경');

    if (wasRunning) this.start();
    return this.getStatus();
  }
}

module.exports = TradingBot;
