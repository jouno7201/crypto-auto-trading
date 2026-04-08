/**
 * 전략 인터페이스 정의
 * 모든 전략은 이 구조를 따라야 합니다.
 *
 * @typedef {Object} Signal
 * @property {'buy'|'sell'|'hold'} action
 * @property {string} reason
 * @property {number} strength - 0~1 신호 강도
 */

class BaseStrategy {
  constructor(name, params = {}) {
    this.name = name;
    this.params = params;
  }

  /**
   * 캔들 데이터를 분석하여 매매 시그널 반환
   * @param {Array} candles - OHLCV 캔들 배열
   * @returns {Signal}
   */
  analyze(candles) {
    throw new Error(`${this.name}: analyze() 미구현`);
  }
}

module.exports = BaseStrategy;
