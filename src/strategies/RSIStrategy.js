/**
 * RSI 전략 (개선판)
 * - 더 실용적인 임계값 (35/65)
 * - RSI 14 + RSI 6 듀얼 확인
 * - 과매도 진입 시 반등 확인 후 매수
 */

const BaseStrategy = require('./BaseStrategy');
const { rsi, ema } = require('./indicators');

class RSIStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('RSI', {
      period: 14,
      fastPeriod: 6,
      oversold: 35,
      overbought: 65,
      trendPeriod: 50,
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { period, fastPeriod, oversold, overbought, trendPeriod } = this.params;

    const rsiValues = rsi(closes, period);
    const rsifast = rsi(closes, fastPeriod);
    const trend = ema(closes, trendPeriod);

    if (rsiValues.length < 3 || rsifast.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const prev2RSI = rsiValues[rsiValues.length - 3];
    const prevRSI = rsiValues[rsiValues.length - 2];
    const currRSI = rsiValues[rsiValues.length - 1];
    const currFastRSI = rsifast[rsifast.length - 1];
    const currPrice = closes[closes.length - 1];
    const currTrend = trend.length > 0 ? trend[trend.length - 1] : currPrice;

    // 매수: RSI가 과매도에서 반등 (RSI 상승 확인) + 빠른 RSI도 반등
    if (prevRSI <= oversold && currRSI > oversold && currRSI > prevRSI) {
      const strength = Math.min((oversold - Math.min(prev2RSI, prevRSI)) / 20 + 0.3, 1);
      return {
        action: 'buy',
        reason: `RSI 과매도 반등 (${currRSI.toFixed(1)}, fast:${currFastRSI.toFixed(1)})`,
        strength,
      };
    }

    // 매수: RSI 연속 상승 반전 (더 깊은 과매도)
    if (prev2RSI < prevRSI && prevRSI < oversold - 5 && currRSI > prevRSI && currFastRSI > 30) {
      const strength = Math.min((oversold - prevRSI) / 25 + 0.2, 0.8);
      return { action: 'buy', reason: `RSI 과매도 반전 (${currRSI.toFixed(1)})`, strength };
    }

    // 매도: RSI가 과매수에서 꺾임
    if (prevRSI >= overbought && currRSI < overbought && currRSI < prevRSI) {
      const strength = Math.min((Math.max(prev2RSI, prevRSI) - overbought) / 20 + 0.3, 1);
      return { action: 'sell', reason: `RSI 과매수 반락 (${currRSI.toFixed(1)})`, strength };
    }

    // 매도: RSI 연속 하락 반전 (더 깊은 과매수)
    if (prev2RSI > prevRSI && prevRSI > overbought + 5 && currRSI < prevRSI && currFastRSI < 70) {
      const strength = Math.min((prevRSI - overbought) / 25 + 0.2, 0.8);
      return { action: 'sell', reason: `RSI 과매수 반전 (${currRSI.toFixed(1)})`, strength };
    }

    return { action: 'hold', reason: `RSI 중립 (${currRSI.toFixed(1)})`, strength: 0 };
  }
}

module.exports = RSIStrategy;
