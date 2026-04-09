/**
 * 볼린저 밴드 전략 (v3)
 * - 스퀴즈 브레이크아웃 (핵심 신호)
 * - BB 밴드 터치 반전 (평균 회귀)
 * - %B 기반 추세 확인
 * - 신호 강도 보정 (market detector 통과)
 */

const BaseStrategy = require('./BaseStrategy');
const { bollingerBands, rsi, sma } = require('./indicators');

class BollingerBand extends BaseStrategy {
  constructor(params = {}) {
    super('Bollinger Band', {
      period: 20,
      multiplier: 2,
      squeezeLookback: 20,
      rsiPeriod: 14,
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { period, multiplier, squeezeLookback, rsiPeriod } = this.params;

    const bb = bollingerBands(closes, period, multiplier);
    const rsiValues = rsi(closes, rsiPeriod);

    if (bb.upper.length < squeezeLookback + 2 || rsiValues.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const len = bb.upper.length;
    const currPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 2];
    const currUpper = bb.upper[len - 1];
    const currLower = bb.lower[len - 1];
    const currMiddle = bb.middle[len - 1];
    const prevUpper = bb.upper[len - 2];
    const prevLower = bb.lower[len - 2];
    const prevMiddle = bb.middle[len - 2];

    const currRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];

    // %B 계산
    const bbWidth = currUpper - currLower;
    const percentB = bbWidth > 0 ? (currPrice - currLower) / bbWidth : 0.5;
    const prevBbWidth = prevUpper - prevLower;
    const prevPercentB = prevBbWidth > 0 ? (prevPrice - prevLower) / prevBbWidth : 0.5;

    // 밴드폭 계산 (현재 & 최근)
    const bandwidths = [];
    for (let i = len - squeezeLookback; i < len; i++) {
      bandwidths.push((bb.upper[i] - bb.lower[i]) / bb.middle[i]);
    }
    const currBW = bandwidths[bandwidths.length - 1];
    const avgBW = bandwidths.reduce((a, b) => a + b, 0) / bandwidths.length;
    const isSqueeze = currBW < avgBW * 0.75;
    const isExpanding = currBW > avgBW * 1.1;

    // ========== 매수 ==========

    // 1) 스퀴즈 후 상방 브레이크아웃 (가장 강력)
    if (isSqueeze && currPrice > currUpper && prevPrice <= prevUpper) {
      return { action: 'buy', reason: `스퀴즈 상방돌파 (%B:${percentB.toFixed(2)})`, strength: 0.9 };
    }

    // 2) 하단 밴드 터치 후 반등
    if (prevPrice <= prevLower && currPrice > currLower && currPrice > prevPrice) {
      if (currRSI < 45 && currRSI > prevRSI) {
        const strength = Math.min(0.7 + (1 - percentB) * 0.2, 0.9);
        return { action: 'buy', reason: `하단밴드 반등 (%B:${percentB.toFixed(2)})`, strength };
      }
    }

    // 3) %B 0.15 이하에서 반등 시작
    if (prevPercentB < 0.15 && percentB > prevPercentB && percentB < 0.35) {
      if (currRSI > prevRSI && currPrice > prevPrice) {
        return { action: 'buy', reason: `%B 반등 (${prevPercentB.toFixed(2)}→${percentB.toFixed(2)})`, strength: 0.7 };
      }
    }

    // 4) 중심선 상향 돌파 + 밴드 확장
    if (prevPrice < prevMiddle && currPrice >= currMiddle && isExpanding) {
      if (currRSI > 45 && currRSI < 65) {
        return { action: 'buy', reason: `중심선 돌파+확장 (%B:${percentB.toFixed(2)})`, strength: 0.65 };
      }
    }

    // ========== 매도 ==========

    // 5) 스퀴즈 후 하방 이탈
    if (isSqueeze && currPrice < currLower && prevPrice >= prevLower) {
      return { action: 'sell', reason: `스퀴즈 하방이탈 (%B:${percentB.toFixed(2)})`, strength: 0.9 };
    }

    // 6) 상단 밴드 터치 후 반락
    if (prevPrice >= prevUpper && currPrice < currUpper && currPrice < prevPrice) {
      if (currRSI > 55 && currRSI < prevRSI) {
        const strength = Math.min(0.7 + percentB * 0.2, 0.9);
        return { action: 'sell', reason: `상단밴드 반락 (%B:${percentB.toFixed(2)})`, strength };
      }
    }

    // 7) %B 0.85 이상에서 하락 시작
    if (prevPercentB > 0.85 && percentB < prevPercentB && percentB > 0.65) {
      if (currRSI < prevRSI && currPrice < prevPrice) {
        return { action: 'sell', reason: `%B 반락 (${prevPercentB.toFixed(2)}→${percentB.toFixed(2)})`, strength: 0.7 };
      }
    }

    // 8) 중심선 하향 이탈 + 밴드 확장
    if (prevPrice > prevMiddle && currPrice <= currMiddle && isExpanding) {
      if (currRSI < 55 && currRSI > 35) {
        return { action: 'sell', reason: `중심선 이탈+확장 (%B:${percentB.toFixed(2)})`, strength: 0.65 };
      }
    }

    return { action: 'hold', reason: `BB 중립 (%B:${percentB.toFixed(2)})`, strength: 0 };
  }
}

module.exports = BollingerBand;
