/**
 * MACD 전략 (v3)
 * - MACD/시그널 크로스 + 제로라인 교차 + 히스토그램 다이버전스
 * - 신호 강도 보정 + 다중 진입점
 */

const BaseStrategy = require('./BaseStrategy');
const { macd, ema, rsi } = require('./indicators');

class MACDStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('MACD', {
      fastPeriod: 12,
      slowPeriod: 21, // WF 최적값 (26보다 빠른 반응)
      signalPeriod: 7, // WF 최적값 (9보다 민감)
      trendPeriod: 100,
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { fastPeriod, slowPeriod, signalPeriod, trendPeriod } = this.params;

    const m = macd(closes, fastPeriod, slowPeriod, signalPeriod);
    const trend = ema(closes, trendPeriod);
    const rsiValues = rsi(closes, 14);

    if (m.histogram.length < 4 || m.signalLine.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const hLen = m.histogram.length;
    const sLen = m.signalLine.length;
    const mLen = m.macdLine.length;

    const prev2MACD = m.macdLine[mLen - 3];
    const prevMACD = m.macdLine[mLen - 2];
    const currMACD = m.macdLine[mLen - 1];
    const prevSignal = m.signalLine[sLen - 2];
    const currSignal = m.signalLine[sLen - 1];
    const currHist = m.histogram[hLen - 1];
    const prevHist = m.histogram[hLen - 2];
    const prev2Hist = m.histogram[hLen - 3];
    const prev3Hist = m.histogram[hLen - 4];

    const currPrice = closes[closes.length - 1];
    const currTrend = trend.length > 0 ? trend[trend.length - 1] : currPrice;
    const isUptrend = currPrice > currTrend;
    const currRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;

    // ========== 매수 ==========

    // 1) MACD 골든크로스
    if (prevMACD <= prevSignal && currMACD > currSignal) {
      const aboveZero = currMACD > 0;
      const strength = aboveZero ? 0.85 : 0.7;
      return { action: 'buy', reason: `MACD 골든크로스${aboveZero ? ' (제로상)' : ''}`, strength };
    }

    // 2) MACD 제로라인 상향 돌파 (추세 전환 확인)
    if (prevMACD <= 0 && currMACD > 0 && currMACD > currSignal) {
      return { action: 'buy', reason: `MACD 제로라인 돌파`, strength: 0.75 };
    }

    // 3) 히스토그램 연속 반등 (3봉 패턴: 하락→하락→상승→상승)
    if (prev3Hist > prev2Hist && prev2Hist < prevHist && prevHist < currHist && currHist < 0) {
      if (currRSI > 35 && currRSI < 55) {
        return { action: 'buy', reason: `MACD 히스토그램 V반전`, strength: 0.7 };
      }
    }

    // 4) 히스토그램 단순 반등 (음수에서 증가 시작)
    if (prevHist < 0 && currHist > prevHist && prev2Hist <= prevHist && isUptrend) {
      const recovering = currHist > prev2Hist;
      if (recovering) {
        return { action: 'buy', reason: `MACD 히스토그램 반등 (${currHist.toFixed(0)})`, strength: 0.65 };
      }
    }

    // ========== 매도 ==========

    // 5) MACD 데드크로스
    if (prevMACD >= prevSignal && currMACD < currSignal) {
      const belowZero = currMACD < 0;
      const strength = belowZero ? 0.85 : 0.7;
      return { action: 'sell', reason: `MACD 데드크로스${belowZero ? ' (제로하)' : ''}`, strength };
    }

    // 6) MACD 제로라인 하향 이탈
    if (prevMACD >= 0 && currMACD < 0 && currMACD < currSignal) {
      return { action: 'sell', reason: `MACD 제로라인 이탈`, strength: 0.75 };
    }

    // 7) 히스토그램 연속 하락 (3봉 패턴: 상승→상승→하락→하락)
    if (prev3Hist < prev2Hist && prev2Hist > prevHist && prevHist > currHist && currHist > 0) {
      if (currRSI > 45 && currRSI < 65) {
        return { action: 'sell', reason: `MACD 히스토그램 역V반전`, strength: 0.7 };
      }
    }

    // 8) 히스토그램 단순 하락 (양수에서 감소 시작)
    if (prevHist > 0 && currHist < prevHist && prev2Hist >= prevHist && !isUptrend) {
      const declining = currHist < prev2Hist;
      if (declining) {
        return { action: 'sell', reason: `MACD 히스토그램 하락 (${currHist.toFixed(0)})`, strength: 0.65 };
      }
    }

    return { action: 'hold', reason: `MACD 중립 (${currMACD.toFixed(0)})`, strength: 0 };
  }
}

module.exports = MACDStrategy;
