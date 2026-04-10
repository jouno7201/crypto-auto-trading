/**
 * MACD 전략 v4
 * - MACD/시그널 크로스 + 제로라인 교차 + 히스토그램 다이버전스
 * - v4: 시장 상태 필터 (횡보장 억제), 히스토그램 크기 검증, RSI 연동 강화
 */

const BaseStrategy = require('./BaseStrategy');
const { macd, ema, rsi, atr } = require('./indicators');
const { detectMarketState } = require('./marketDetector');

class MACDStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('MACD', {
      fastPeriod: 12,
      slowPeriod: 21, // WF 최적값
      signalPeriod: 7, // WF 최적값
      trendPeriod: 100,
      // v4 신규 파라미터
      rangingADXThreshold: 18, // ADX < 18 횡보장에서 시그널 감쇠
      histMinATRRatio: 0.1, // 히스토그램 최소 크기 (ATR 대비)
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { fastPeriod, slowPeriod, signalPeriod, trendPeriod, rangingADXThreshold, histMinATRRatio } = this.params;

    const m = macd(closes, fastPeriod, slowPeriod, signalPeriod);
    const trend = ema(closes, trendPeriod);
    const rsiValues = rsi(closes, 14);
    const atrValues = atr(candles, 14);

    if (m.histogram.length < 4 || m.signalLine.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    // v4: 시장 상태 확인
    const market = detectMarketState(candles);
    const isRanging = market.state === 'ranging' && market.adx < rangingADXThreshold;
    const isVolatile = market.state === 'volatile';

    // v4: 횡보장 시그널 감쇠 계수 (ADX가 낮을수록 시그널 약화)
    let regimeDamp = 1.0;
    if (isRanging) {
      regimeDamp = Math.max(0.4, market.adx / rangingADXThreshold);
    } else if (isVolatile) {
      regimeDamp = 0.6;
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
    const currATR = atrValues.length > 0 ? atrValues[atrValues.length - 1] : 0;

    // v4: 히스토그램 크기 검증 (ATR 대비 너무 작으면 노이즈)
    const histSignificant = currATR > 0 ? Math.abs(currHist) / currATR >= histMinATRRatio : true;

    // ========== 매수 ==========

    // 1) MACD 골든크로스
    if (prevMACD <= prevSignal && currMACD > currSignal) {
      const aboveZero = currMACD > 0;
      let strength = aboveZero ? 0.85 : 0.7;
      // v4: 히스토그램 크기 + 시장 상태 보정
      if (!histSignificant) strength -= 0.15;
      strength = Math.max(0.3, strength * regimeDamp);
      if (strength < 0.4)
        return { action: 'hold', reason: `MACD 골든크로스 필터됨 (약신호, ${market.state})`, strength: 0 };
      return { action: 'buy', reason: `MACD 골든크로스${aboveZero ? ' (제로상)' : ''} [${market.state}]`, strength };
    }

    // 2) MACD 제로라인 상향 돌파
    if (prevMACD <= 0 && currMACD > 0 && currMACD > currSignal) {
      let strength = 0.75 * regimeDamp;
      if (strength < 0.4) return { action: 'hold', reason: `제로라인 돌파 필터됨 (${market.state})`, strength: 0 };
      return { action: 'buy', reason: `MACD 제로라인 돌파 [${market.state}]`, strength };
    }

    // 3) 히스토그램 연속 반등 (3봉 V패턴)
    //    v4: RSI 확인 강화 + 히스토그램 크기 검증
    if (prev3Hist > prev2Hist && prev2Hist < prevHist && prevHist < currHist && currHist < 0) {
      if (currRSI > 35 && currRSI < 60 && histSignificant) {
        let strength = 0.7 * regimeDamp;
        if (strength < 0.4) return { action: 'hold', reason: `히스토그램 V반전 필터됨 (${market.state})`, strength: 0 };
        return { action: 'buy', reason: `MACD 히스토그램 V반전 [${market.state}]`, strength };
      }
    }

    // 4) 히스토그램 단순 반등 (음수에서 증가)
    //    v4: 추세 확인 + 크기 검증 강화
    if (prevHist < 0 && currHist > prevHist && prev2Hist <= prevHist && isUptrend && histSignificant) {
      const recovering = currHist > prev2Hist;
      if (recovering) {
        let strength = 0.65 * regimeDamp;
        if (strength < 0.4) return { action: 'hold', reason: `히스토그램 반등 필터됨`, strength: 0 };
        return { action: 'buy', reason: `MACD 히스토그램 반등 (${currHist.toFixed(0)}) [${market.state}]`, strength };
      }
    }

    // ========== 매도 ==========

    // 5) MACD 데드크로스
    if (prevMACD >= prevSignal && currMACD < currSignal) {
      const belowZero = currMACD < 0;
      let strength = belowZero ? 0.85 : 0.7;
      if (!histSignificant) strength -= 0.15;
      strength = Math.max(0.3, strength * regimeDamp);
      if (strength < 0.4)
        return { action: 'hold', reason: `MACD 데드크로스 필터됨 (약신호, ${market.state})`, strength: 0 };
      return { action: 'sell', reason: `MACD 데드크로스${belowZero ? ' (제로하)' : ''} [${market.state}]`, strength };
    }

    // 6) MACD 제로라인 하향 이탈
    if (prevMACD >= 0 && currMACD < 0 && currMACD < currSignal) {
      let strength = 0.75 * regimeDamp;
      if (strength < 0.4) return { action: 'hold', reason: `제로라인 이탈 필터됨 (${market.state})`, strength: 0 };
      return { action: 'sell', reason: `MACD 제로라인 이탈 [${market.state}]`, strength };
    }

    // 7) 히스토그램 연속 하락 (역V패턴)
    if (prev3Hist < prev2Hist && prev2Hist > prevHist && prevHist > currHist && currHist > 0) {
      if (currRSI > 40 && currRSI < 65 && histSignificant) {
        let strength = 0.7 * regimeDamp;
        if (strength < 0.4)
          return { action: 'hold', reason: `히스토그램 역V반전 필터됨 (${market.state})`, strength: 0 };
        return { action: 'sell', reason: `MACD 히스토그램 역V반전 [${market.state}]`, strength };
      }
    }

    // 8) 히스토그램 단순 하락 (양수에서 감소)
    if (prevHist > 0 && currHist < prevHist && prev2Hist >= prevHist && !isUptrend && histSignificant) {
      const declining = currHist < prev2Hist;
      if (declining) {
        let strength = 0.65 * regimeDamp;
        if (strength < 0.4) return { action: 'hold', reason: `히스토그램 하락 필터됨`, strength: 0 };
        return { action: 'sell', reason: `MACD 히스토그램 하락 (${currHist.toFixed(0)}) [${market.state}]`, strength };
      }
    }

    return { action: 'hold', reason: `MACD 중립 (${currMACD.toFixed(0)}) [${market.state}]`, strength: 0 };
  }
}

module.exports = MACDStrategy;
