/**
 * RSI 전략 (v3)
 * - 과매도/과매수 반등 + RSI 다이버전스 + 중앙선 크로스
 * - 더 넓은 신호 영역으로 거래 빈도 증가
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

    if (rsiValues.length < 5 || rsifast.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const prev3RSI = rsiValues[rsiValues.length - 4];
    const prev2RSI = rsiValues[rsiValues.length - 3];
    const prevRSI = rsiValues[rsiValues.length - 2];
    const currRSI = rsiValues[rsiValues.length - 1];
    const currFastRSI = rsifast[rsifast.length - 1];
    const prevFastRSI = rsifast[rsifast.length - 2];
    const currPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 2];
    const currTrend = trend.length > 0 ? trend[trend.length - 1] : currPrice;
    const isUptrend = currPrice > currTrend;

    // 1) 과매도 반등 매수
    if (prevRSI <= oversold && currRSI > oversold && currRSI > prevRSI) {
      const depth = oversold - Math.min(prev2RSI, prevRSI);
      const strength = Math.min(depth / 15 + 0.65, 1);
      return { action: 'buy', reason: `RSI 과매도 반등 (${currRSI.toFixed(0)})`, strength };
    }

    // 2) RSI 불리시 다이버전스 (가격 저점 갱신 but RSI 저점 상승)
    if (rsiValues.length >= 20) {
      const lookback = 15;
      const recentCloses = closes.slice(-lookback);
      const recentRSI = rsiValues.slice(-lookback);
      const priceNewLow = currPrice <= Math.min(...recentCloses.slice(0, -1));
      const rsiHigherLow = currRSI > Math.min(...recentRSI.slice(0, -3));
      if (priceNewLow && rsiHigherLow && currRSI < 45 && currRSI > prevRSI) {
        return { action: 'buy', reason: `RSI 불리시 다이버전스 (${currRSI.toFixed(0)})`, strength: 0.8 };
      }
    }

    // 3) RSI 50선 상향 돌파 + 상승추세 (추세 확인)
    if (prevRSI < 50 && currRSI >= 50 && currRSI > prevRSI && isUptrend) {
      if (currFastRSI > prevFastRSI && currFastRSI > 45) {
        return { action: 'buy', reason: `RSI 50선 돌파 (${currRSI.toFixed(0)})`, strength: 0.65 };
      }
    }

    // 4) 고점에서 RSI 급락 (3봉 연속 하락, 10포인트 이상)
    if (prev2RSI > prevRSI && prevRSI > currRSI && prev2RSI - currRSI > 10 && currRSI < 55) {
      if (prev2RSI > 55) {
        return { action: 'sell', reason: `RSI 급락 (${prev2RSI.toFixed(0)}→${currRSI.toFixed(0)})`, strength: 0.7 };
      }
    }

    // 5) 과매수 반락 매도
    if (prevRSI >= overbought && currRSI < overbought && currRSI < prevRSI) {
      const depth = Math.max(prev2RSI, prevRSI) - overbought;
      const strength = Math.min(depth / 15 + 0.65, 1);
      return { action: 'sell', reason: `RSI 과매수 반락 (${currRSI.toFixed(0)})`, strength };
    }

    // 6) RSI 베어리시 다이버전스 (가격 고점 갱신 but RSI 고점 하락)
    if (rsiValues.length >= 20) {
      const lookback = 15;
      const recentCloses = closes.slice(-lookback);
      const recentRSI = rsiValues.slice(-lookback);
      const priceNewHigh = currPrice >= Math.max(...recentCloses.slice(0, -1));
      const rsiLowerHigh = currRSI < Math.max(...recentRSI.slice(0, -3));
      if (priceNewHigh && rsiLowerHigh && currRSI > 55 && currRSI < prevRSI) {
        return { action: 'sell', reason: `RSI 베어리시 다이버전스 (${currRSI.toFixed(0)})`, strength: 0.8 };
      }
    }

    // 7) RSI 50선 하향 이탈 + 하락추세
    if (prevRSI > 50 && currRSI <= 50 && currRSI < prevRSI && !isUptrend) {
      if (currFastRSI < prevFastRSI && currFastRSI < 55) {
        return { action: 'sell', reason: `RSI 50선 이탈 (${currRSI.toFixed(0)})`, strength: 0.65 };
      }
    }

    return { action: 'hold', reason: `RSI 중립 (${currRSI.toFixed(1)})`, strength: 0 };
  }
}

module.exports = RSIStrategy;
