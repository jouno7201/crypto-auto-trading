/**
 * 리스크 관리 모듈
 * - ATR 기반 동적 손절/익절/트레일링 스탑
 * - 부분 익절 (TP 래더)
 * - 시장 상태별 계수 자동 조정
 * - 최대 투자 비중 제한 (종목당 / 전체)
 * - 일일 최대 손실 한도
 * - 포지션 사이즈 계산
 */

const store = require('../store/jsonStore');

const DEFAULT_CONFIG = {
  maxPositionRatio: 0.3, // 종목당 최대 투자비율 (30%)
  maxTotalExposure: 0.9, // 전체 최대 투자비율 (90%)
  stopLossPercent: 3, // 고정 % 손절 (ATR 비활성시 폴백)
  takeProfitPercent: 5, // 고정 % 익절 (ATR 비활성시 폴백)
  dailyMaxLossPercent: 5, // 일일 최대 손실 한도 (-5%)
  fixedRiskRatio: 0.02, // 고정 비율 리스크 (자본의 2%)

  // ATR 기반 동적 SL/TP/TS
  stopLossATR: 2.0, // ATR × N 손절 (0 = 고정% 사용)
  takeProfitATR: 3.0, // ATR × N 익절 (0 = 고정% 사용)
  trailingStopATR: 2.5, // ATR × N 트레일링 스탑 (0 = 비활성)

  // 부분 익절 래더 (포지션 비율 × ATR 배수)
  tpLadder: [
    { atrMult: 2.0, portion: 0.33 }, // ATR×2 도달 → 33% 청산
    { atrMult: 3.5, portion: 0.33 }, // ATR×3.5 도달 → 33% 청산
    // 나머지 34%는 트레일링 스탑 또는 최종 TP로 청산
  ],
};

class RiskManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dailyStartCapital = 0;
    this.dailyPnL = 0;
    this.tradingHalted = false;
  }

  /**
   * 일일 시작 자본 설정 (매일 리셋)
   */
  setDailyStart(capital) {
    this.dailyStartCapital = capital;
    this.dailyPnL = 0;
    this.tradingHalted = false;
  }

  /**
   * 매매 가능 여부 확인
   */
  canTrade(currentCapital, positions = []) {
    // 일일 손실 한도 초과 체크
    if (this.dailyStartCapital > 0) {
      const dailyLossPercent = ((this.dailyStartCapital - currentCapital) / this.dailyStartCapital) * 100;
      if (dailyLossPercent >= this.config.dailyMaxLossPercent) {
        this.tradingHalted = true;
        return { allowed: false, reason: `일일 최대 손실 한도 도달 (-${dailyLossPercent.toFixed(1)}%)` };
      }
    }

    if (this.tradingHalted) {
      return { allowed: false, reason: '매매 중지 상태' };
    }

    // 전체 투자 비율 체크
    const totalExposure = positions.reduce((sum, p) => sum + p.value, 0);
    const totalAssets = currentCapital + totalExposure;
    const exposureRatio = totalExposure / totalAssets;

    if (exposureRatio >= this.config.maxTotalExposure) {
      return { allowed: false, reason: `전체 투자비율 한도 (${(exposureRatio * 100).toFixed(1)}%)` };
    }

    return { allowed: true };
  }

  /**
   * 포지션 사이즈 계산 (투자 금액 결정)
   * @param {number} capital - 가용 자본
   * @param {number} currentPrice - 현재 가격
   * @param {Array} positions - 현재 포지션 목록
   */
  calculatePositionSize(capital, currentPrice, positions = []) {
    const totalAssets = capital + positions.reduce((sum, p) => sum + p.value, 0);

    // 종목당 최대 투자금
    const maxPerPosition = totalAssets * this.config.maxPositionRatio;

    // 고정 비율 리스크 방식: 손절시 잃을 금액 = 자본 * fixedRiskRatio
    const riskAmount = totalAssets * this.config.fixedRiskRatio;
    const riskBasedSize = riskAmount / (this.config.stopLossPercent / 100);

    // 둘 중 작은 값
    const investAmount = Math.min(maxPerPosition, riskBasedSize, capital);

    return {
      investAmount: Math.floor(investAmount),
      volume: investAmount / currentPrice,
      maxPerPosition: Math.floor(maxPerPosition),
    };
  }

  /**
   * 손절/익절 가격 계산 (ATR 우선, 없으면 고정%)
   * @param {number} entryPrice - 진입가
   * @param {number} currentATR - 현재 ATR 값 (없으면 고정% 사용)
   * @param {string} marketState - 시장 상태 (trending-up/down, ranging, volatile)
   */
  getExitPrices(entryPrice, currentATR = 0, marketState = '') {
    let slMult = this.config.stopLossATR;
    let tpMult = this.config.takeProfitATR;
    let tsMult = this.config.trailingStopATR;

    // 시장 상태별 계수 조정 (백테스트 엔진과 동일)
    if (marketState === 'volatile') {
      slMult *= 1.3;
      tpMult *= 1.2;
      tsMult *= 1.3;
    } else if (marketState === 'trending-up' || marketState === 'trending-down') {
      tsMult *= 0.85; // 추세장: 트레일링 타이트
    }

    // ATR 기반 (ATR 값이 유효한 경우)
    if (currentATR > 0 && slMult > 0) {
      return {
        stopLoss: entryPrice - currentATR * slMult,
        takeProfit:
          tpMult > 0 ? entryPrice + currentATR * tpMult : entryPrice * (1 + this.config.takeProfitPercent / 100),
        trailingStop: tsMult > 0 ? tsMult : 0,
        mode: 'atr',
        atr: currentATR,
        multipliers: { sl: slMult, tp: tpMult, ts: tsMult },
      };
    }

    // 폴백: 고정 % 기반
    return {
      stopLoss: entryPrice * (1 - this.config.stopLossPercent / 100),
      takeProfit: entryPrice * (1 + this.config.takeProfitPercent / 100),
      trailingStop: 0,
      mode: 'fixed',
      atr: 0,
      multipliers: { sl: 0, tp: 0, ts: 0 },
    };
  }

  /**
   * 현재 포지션의 종합 청산 체크 (ATR SL/TP + 트레일링 + 부분 TP)
   * @param {object} positionInfo - { entryPrice, peakPrice, currentATR, marketState, tpLadderFilled }
   * @param {number} currentPrice - 현재가
   */
  checkExit(entryPrice, currentPrice, positionInfo = {}) {
    const { peakPrice = 0, currentATR = 0, marketState = '', tpLadderFilled = [] } = positionInfo;
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    const exits = this.getExitPrices(entryPrice, currentATR, marketState);

    // 1) 손절 체크
    if (currentPrice <= exits.stopLoss) {
      return { shouldExit: true, exitAll: true, reason: `손절 (${pnlPercent.toFixed(2)}%)`, type: 'stop-loss' };
    }

    // 2) 부분 익절 래더 체크
    if (currentATR > 0 && this.config.tpLadder && this.config.tpLadder.length > 0) {
      for (let i = 0; i < this.config.tpLadder.length; i++) {
        if (tpLadderFilled.includes(i)) continue; // 이미 체결된 단계 스킵
        const { atrMult, portion } = this.config.tpLadder[i];
        const ladderPrice = entryPrice + currentATR * atrMult;
        if (currentPrice >= ladderPrice) {
          return {
            shouldExit: true,
            exitAll: false,
            portion,
            ladderIndex: i,
            reason: `부분익절 L${i + 1} (ATR×${atrMult}, ${pnlPercent.toFixed(2)}%)`,
            type: 'tp-ladder',
          };
        }
      }
    }

    // 3) 트레일링 스탑 체크 (고점 대비)
    if (exits.trailingStop > 0 && currentATR > 0 && peakPrice > entryPrice) {
      const tsPrice = peakPrice - currentATR * exits.multipliers.ts;
      if (tsPrice > entryPrice && currentPrice <= tsPrice) {
        return {
          shouldExit: true,
          exitAll: true,
          reason: `트레일링스탑 (고점 ${peakPrice.toFixed(0)} → ${pnlPercent.toFixed(2)}%)`,
          type: 'trailing-stop',
        };
      }
    }

    // 4) 최종 익절 체크
    if (currentPrice >= exits.takeProfit) {
      return { shouldExit: true, exitAll: true, reason: `익절 (${pnlPercent.toFixed(2)}%)`, type: 'take-profit' };
    }

    return { shouldExit: false, pnlPercent: parseFloat(pnlPercent.toFixed(2)) };
  }

  /**
   * 리스크 설정 업데이트
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    store.save('risk-config.json', this.config);
  }

  /**
   * 리스크 상태 조회
   */
  getStatus(capital, positions = []) {
    const totalExposure = positions.reduce((sum, p) => sum + p.value, 0);
    const totalAssets = capital + totalExposure;
    return {
      config: this.config,
      tradingHalted: this.tradingHalted,
      dailyStartCapital: this.dailyStartCapital,
      currentCapital: capital,
      totalExposure,
      totalAssets,
      exposureRatio: totalAssets > 0 ? parseFloat(((totalExposure / totalAssets) * 100).toFixed(1)) : 0,
    };
  }
}

module.exports = RiskManager;
