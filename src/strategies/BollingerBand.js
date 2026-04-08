/**
 * 볼린저 밴드 전략 (개선판)
 * - 밴드 스퀴즈(수축) 후 돌파 감지 → 추세 진입
 * - %B 지표로 정밀한 진입/청산
 * - RSI 보조 필터로 잘못된 시그널 제거
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

    if (bb.upper.length < squeezeLookback + 2 || rsiValues.length < 2) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const len = bb.upper.length;
    const prevClose = closes[closes.length - 2];
    const currClose = closes[closes.length - 1];
    const currLower = bb.lower[len - 1];
    const currUpper = bb.upper[len - 1];
    const currMiddle = bb.middle[len - 1];
    const prevLower = bb.lower[len - 2];
    const prevUpper = bb.upper[len - 2];
    const currRSI = rsiValues[rsiValues.length - 1];

    // %B 계산: 0이면 하단, 1이면 상단, 0.5이면 중앙
    const percentB = currUpper === currLower ? 0.5 : (currClose - currLower) / (currUpper - currLower);

    // 밴드폭 계산 (현재 & 최근)
    const bandwidths = [];
    for (let i = len - squeezeLookback; i < len; i++) {
      bandwidths.push((bb.upper[i] - bb.lower[i]) / bb.middle[i]);
    }
    const currBW = bandwidths[bandwidths.length - 1];
    const avgBW = bandwidths.reduce((a, b) => a + b, 0) / bandwidths.length;
    const isSqueeze = currBW < avgBW * 0.75;

    // 1) 스퀴즈 후 상단 돌파 + RSI 중립 이상 → 강한 매수
    if (isSqueeze && currClose > currUpper && currRSI > 45 && currRSI < 75) {
      return {
        action: 'buy',
        reason: `볼린저 스퀴즈 돌파 (%B:${percentB.toFixed(2)}, RSI:${currRSI.toFixed(0)})`,
        strength: 0.9,
      };
    }

    // 2) 하단 밴드 터치 후 반등 + RSI 과매도 아님
    if (prevClose <= prevLower && currClose > currLower && currRSI > 25) {
      const strength = Math.min(0.3 + ((currMiddle - currClose) / (currMiddle - currLower)) * 0.5, 0.85);
      return { action: 'buy', reason: `볼린저 하단 반등 (%B:${percentB.toFixed(2)})`, strength };
    }

    // 3) %B가 0.8 이상에서 꺾이기 시작 + RSI 과매수 영역
    const prevPercentB =
      prevUpper === prevLower ? 0.5 : (prevClose - bb.lower[len - 2]) / (prevUpper - bb.lower[len - 2]);
    if (prevPercentB > 0.8 && percentB < prevPercentB && currRSI > 60) {
      const strength = Math.min(0.3 + (percentB - 0.5) * 1.5, 0.85);
      return {
        action: 'sell',
        reason: `볼린저 상단 반락 (%B:${percentB.toFixed(2)}, RSI:${currRSI.toFixed(0)})`,
        strength,
      };
    }

    // 4) 상단 밴드 터치 후 하향 + RSI 과매수
    if (prevClose >= prevUpper && currClose < currUpper && currRSI > 60) {
      const strength = Math.min(0.3 + ((currClose - currMiddle) / (currUpper - currMiddle)) * 0.5, 0.85);
      return { action: 'sell', reason: `볼린저 상단밴드 반락`, strength };
    }

    return { action: 'hold', reason: `볼린저 중립 (%B:${percentB.toFixed(2)})`, strength: 0 };
  }
}

module.exports = BollingerBand;
