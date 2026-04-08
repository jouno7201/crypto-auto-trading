/**
 * MACD 전략
 * - MACD 라인 & 시그널 라인 크로스
 * - 히스토그램 모멘텀 확인
 * - 제로라인 위치로 추세 방향 판단
 */

const BaseStrategy = require('./BaseStrategy');
const { macd, ema } = require('./indicators');

class MACDStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('MACD', {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      trendPeriod: 100,
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { fastPeriod, slowPeriod, signalPeriod, trendPeriod } = this.params;

    const m = macd(closes, fastPeriod, slowPeriod, signalPeriod);
    const trend = ema(closes, trendPeriod);

    if (m.histogram.length < 3 || m.signalLine.length < 2) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const hLen = m.histogram.length;
    const sLen = m.signalLine.length;
    const mLen = m.macdLine.length;
    const mOff = mLen - sLen;

    const prevMACD = m.macdLine[mLen - 2];
    const currMACD = m.macdLine[mLen - 1];
    const prevSignal = m.signalLine[sLen - 2];
    const currSignal = m.signalLine[sLen - 1];
    const currHist = m.histogram[hLen - 1];
    const prevHist = m.histogram[hLen - 2];
    const prev2Hist = m.histogram[hLen - 3];

    const currPrice = closes[closes.length - 1];
    const currTrend = trend.length > 0 ? trend[trend.length - 1] : currPrice;
    const isUptrend = currPrice > currTrend;

    // 매수: MACD가 시그널을 상향 돌파 + 히스토그램 양수 전환
    if (prevMACD <= prevSignal && currMACD > currSignal) {
      // 제로라인 위에서 교차하면 강한 시그널
      const aboveZero = currMACD > 0;
      let strength = aboveZero ? 0.8 : 0.6;
      if (isUptrend) strength = Math.min(strength + 0.15, 1);
      return {
        action: 'buy',
        reason: `MACD 골든크로스${aboveZero ? ' (제로상)' : ''}${isUptrend ? ' +추세' : ''}`,
        strength,
      };
    }

    // 매수: 히스토그램 바닥 반전 (연속 3봉 패턴: 감소→감소→증가)
    if (prev2Hist < prevHist && prevHist < 0 && currHist > prevHist && currHist < 0 && isUptrend) {
      return {
        action: 'buy',
        reason: `MACD 히스토그램 반전 (${currHist.toFixed(0)})`,
        strength: 0.55,
      };
    }

    // 매도: MACD가 시그널을 하향 돌파
    if (prevMACD >= prevSignal && currMACD < currSignal) {
      const belowZero = currMACD < 0;
      let strength = belowZero ? 0.8 : 0.6;
      if (!isUptrend) strength = Math.min(strength + 0.15, 1);
      return {
        action: 'sell',
        reason: `MACD 데드크로스${belowZero ? ' (제로하)' : ''}`,
        strength,
      };
    }

    // 매도: 히스토그램 고점 반전
    if (prev2Hist > prevHist && prevHist > 0 && currHist < prevHist && currHist > 0 && !isUptrend) {
      return {
        action: 'sell',
        reason: `MACD 히스토그램 하락 반전 (${currHist.toFixed(0)})`,
        strength: 0.55,
      };
    }

    return { action: 'hold', reason: `MACD 중립 (${currMACD.toFixed(0)})`, strength: 0 };
  }
}

module.exports = MACDStrategy;
