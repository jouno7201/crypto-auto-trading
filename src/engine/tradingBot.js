/**
 * 매매 스케줄러 (트레이딩 봇 코어)
 * - 전략 엔진 → 시그널 발생 → 리스크 체크 → 주문 실행
 * - 루프 기반 자동 매매
 * - 전략별 ON/OFF
 * - 페이퍼 트레이딩 모드
 */

const { fetchUpbitCandles } = require('./dataCollector');
const { executeOrder } = require('./executor');
const RiskManager = require('./riskManager');
const { createStrategy } = require('../strategies');
const store = require('../store/jsonStore');

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

    // 일일 시작 자본 설정
    this.riskManager.setDailyStart(this.capital);
  }

  /**
   * 봇 시작
   */
  start() {
    if (this.running) {
      console.log('[봇] 이미 실행 중');
      return;
    }

    this.running = true;
    console.log('═══════════════════════════════════════');
    console.log('  🤖 트레이딩 봇 시작');
    console.log('═══════════════════════════════════════');
    console.log(`  마켓: ${this.config.market}`);
    console.log(`  전략: ${this.strategy.name}`);
    console.log(`  모드: ${process.env.TRADING_MODE || 'paper'}`);
    console.log(`  간격: ${this.config.intervalMs / 1000}초`);
    console.log(`  자본: ${this.capital.toLocaleString()}원`);
    console.log('═══════════════════════════════════════\n');

    // 즉시 한 번 실행 후 인터벌
    this.tick();
    this.intervalId = setInterval(() => this.tick(), this.config.intervalMs);
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
    console.log('\n[봇] 트레이딩 봇 정지');
    this._saveState();
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
          console.log(`[봇] ${exitCheck.reason} → 매도 실행`);
          await this._sell(currentPrice, exitCheck.reason);
          return;
        }
      }

      // 4. 전략 시그널 분석
      const signal = this.strategy.analyze(candles);

      // 로그 출력
      const posInfo = this.position ? `보유중 (진입: ${this.position.entryPrice.toLocaleString()})` : '미보유';
      console.log(`[${timestamp}] 현재가: ${currentPrice.toLocaleString()} | 시그널: ${signal.action} | ${posInfo}`);

      // 5. 시그널에 따른 주문 실행
      if (signal.action === 'buy' && !this.position) {
        if (!riskCheck.allowed) {
          console.log(`[봇] 매수 스킵: ${riskCheck.reason}`);
          return;
        }

        const sizing = this.riskManager.calculatePositionSize(this.capital, currentPrice, positions);
        if (sizing.investAmount < 5000) {
          console.log('[봇] 매수 스킵: 최소 주문금액 미달');
          return;
        }

        console.log(`[봇] 매수 시그널: ${signal.reason} (강도: ${signal.strength})`);
        await this._buy(currentPrice, sizing.investAmount, signal.reason);
      }

      if (signal.action === 'sell' && this.position) {
        console.log(`[봇] 매도 시그널: ${signal.reason} (강도: ${signal.strength})`);
        await this._sell(currentPrice, signal.reason);
      }
    } catch (err) {
      console.error(`[봇] 에러: ${err.message}`);
    }
  }

  /**
   * 매수 실행
   */
  async _buy(price, amount, reason) {
    const order = await executeOrder(this.config.market, 'buy', { price: amount, amount });

    if (order.status === 'filled') {
      this.position = {
        market: this.config.market,
        entryPrice: order.executedPrice || price,
        volume: order.executedVolume || amount / price,
        entryTime: new Date().toISOString(),
        reason,
      };
      this.capital -= amount;
      this.tradeCount++;

      const exits = this.riskManager.getExitPrices(this.position.entryPrice);
      console.log(
        `  ✅ 매수 체결 | 가격: ${this.position.entryPrice.toLocaleString()} | 금액: ${amount.toLocaleString()}원`,
      );
      console.log(`  📍 손절: ${exits.stopLoss.toLocaleString()} | 익절: ${exits.takeProfit.toLocaleString()}`);

      store.append('trades.json', {
        type: 'buy',
        market: this.config.market,
        price: this.position.entryPrice,
        volume: this.position.volume,
        amount,
        reason,
        strategy: this.strategy.name,
      });
    }
  }

  /**
   * 매도 실행
   */
  async _sell(price, reason) {
    if (!this.position) return;

    const order = await executeOrder(this.config.market, 'sell', { volume: this.position.volume });

    if (order.status === 'filled') {
      const exitPrice = order.executedPrice || price;
      const proceeds = order.proceeds || this.position.volume * exitPrice * 0.9995;
      const pnl = proceeds - this.position.volume * this.position.entryPrice;
      const pnlPercent = (((exitPrice - this.position.entryPrice) / this.position.entryPrice) * 100).toFixed(2);

      this.capital += proceeds;

      const emoji = pnl >= 0 ? '📈' : '📉';
      console.log(
        `  ${emoji} 매도 체결 | 가격: ${exitPrice.toLocaleString()} | 손익: ${pnl >= 0 ? '+' : ''}${Math.round(pnl).toLocaleString()}원 (${pnlPercent}%)`,
      );

      store.append('trades.json', {
        type: 'sell',
        market: this.config.market,
        entryPrice: this.position.entryPrice,
        exitPrice,
        volume: this.position.volume,
        pnl: Math.round(pnl),
        pnlPercent: parseFloat(pnlPercent),
        reason,
        strategy: this.strategy.name,
      });

      this.position = null;
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
  configure({ market, strategyName, unit }) {
    const wasRunning = this.running;
    if (wasRunning) this.stop();

    if (market) this.config.market = market;
    if (strategyName) {
      this.config.strategyName = strategyName;
      this.strategy = createStrategy(strategyName, this.config.strategyParams);
    }
    if (unit) this.config.unit = unit;

    console.log(`[봇] 설정 변경 → 마켓: ${this.config.market}, 전략: ${this.strategy.name}, 단위: ${this.config.unit}`);

    if (wasRunning) this.start();
    return this.getStatus();
  }
}

module.exports = TradingBot;
