/**
 * 리스크 관리 모듈
 * - 최대 투자 비중 제한 (종목당 / 전체)
 * - 손절(Stop-Loss) / 익절(Take-Profit) 자동 판단
 * - 일일 최대 손실 한도
 * - 포지션 사이즈 계산
 */

const store = require('../store/jsonStore');

const DEFAULT_CONFIG = {
  maxPositionRatio: 0.3, // 종목당 최대 투자비율 (30%)
  maxTotalExposure: 0.9, // 전체 최대 투자비율 (90%)
  stopLossPercent: 3, // 손절 기준 (-3%)
  takeProfitPercent: 5, // 익절 기준 (+5%)
  dailyMaxLossPercent: 5, // 일일 최대 손실 한도 (-5%)
  fixedRiskRatio: 0.02, // 고정 비율 리스크 (자본의 2%)
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
   * 손절/익절 가격 계산
   */
  getExitPrices(entryPrice) {
    return {
      stopLoss: entryPrice * (1 - this.config.stopLossPercent / 100),
      takeProfit: entryPrice * (1 + this.config.takeProfitPercent / 100),
    };
  }

  /**
   * 현재 포지션의 손절/익절 체크
   * @param {number} entryPrice - 진입가
   * @param {number} currentPrice - 현재가
   */
  checkExit(entryPrice, currentPrice) {
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    const { stopLoss, takeProfit } = this.getExitPrices(entryPrice);

    if (currentPrice <= stopLoss) {
      return { shouldExit: true, reason: `손절 (${pnlPercent.toFixed(2)}%)`, type: 'stop-loss' };
    }

    if (currentPrice >= takeProfit) {
      return { shouldExit: true, reason: `익절 (${pnlPercent.toFixed(2)}%)`, type: 'take-profit' };
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
