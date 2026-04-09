/**
 * 이동평균 크로스 전략 (v3)
 * - EMA 9/21 크로스 + 눈림목 매수 + 모멘텀 확산 매도
 * - EMA 100 추세 필터 (200에서 단축)
 */

const BaseStrategy = require('./BaseStrategy');
const { ema, rsi } = require('./indicators');

class MACross extends BaseStrategy {
  constructor(params = {}) {
    super('MA Cross', {
      shortPeriod: 9,
      longPeriod: 21,
      trendPeriod: 100,
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { shortPeriod, longPeriod, trendPeriod } = this.params;

    const shortMA = ema(closes, shortPeriod);
    const longMA = ema(closes, longPeriod);
    const trendMA = ema(closes, trendPeriod);
    const rsiValues = rsi(closes, 14);

    if (shortMA.length < 3 || longMA.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const sOff = shortMA.length - longMA.length;
    const currShort = shortMA[shortMA.length - 1];
    const prevShort = shortMA[shortMA.length - 2];
    const prev2Short = shortMA[shortMA.length - 3];
    const currLong = longMA[longMA.length - 1];
    const prevLong = longMA[longMA.length - 2];
    const currPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 2];

    const hasTrend = trendMA.length > 0;
    const currTrend = hasTrend ? trendMA[trendMA.length - 1] : 0;
    const isUptrend = !hasTrend || currPrice > currTrend;
    const isDowntrend = !hasTrend || currPrice < currTrend;

    // EMA 간격 확산/수렴 (모멘텀 확인)
    const currGap = currShort - currLong;
    const prevGap = prevShort - prevLong;
    const gapExpanding = Math.abs(currGap) > Math.abs(prevGap);
    const gapPct = Math.abs((currGap / currLong) * 100);

    const currRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;

    // 1) 골든 크로스 + 상승 추세
    if (prevShort <= prevLong && currShort > currLong && isUptrend) {
      const strength = Math.min(gapPct * 3 + 0.65, 1);
      return { action: 'buy', reason: `골든크로스 EMA${shortPeriod}/${longPeriod}`, strength };
    }

    // 2) 눈림목 매수: 상승추세에서 가격이 단기EMA로 푸리백 후 반등
    if (currShort > currLong && isUptrend && currGap > 0) {
      const touchedShortMA = candles[candles.length - 2].low <= prevShort * 1.002;
      const bounced = currPrice > currShort;
      if (touchedShortMA && bounced && currRSI > 40 && currRSI < 65) {
        return { action: 'buy', reason: `눈림목 반등 (EMA${shortPeriod} 터치)`, strength: 0.75 };
      }
    }

    // 3) 모멘텀 가속: 상승 정렬 + 간격 확산 + RSI 50~70
    if (currShort > currLong && gapExpanding && isUptrend && currRSI > 50 && currRSI < 70) {
      if (gapPct > 0.15) {
        return { action: 'buy', reason: `모멘텀 확산 (간격:${gapPct.toFixed(2)}%)`, strength: 0.7 };
      }
    }

    // 4) 데드 크로스 + 하락 추세
    if (prevShort >= prevLong && currShort < currLong && isDowntrend) {
      const strength = Math.min(gapPct * 3 + 0.65, 1);
      return { action: 'sell', reason: `데드크로스 EMA${shortPeriod}/${longPeriod}`, strength };
    }

    // 5) 모멘텀 소멸: 상승 정렬이었는데 간격 수렴 + RSI 하락
    if (currShort > currLong && !gapExpanding && prevGap > currGap && currGap > 0) {
      if (currRSI < 45 && gapPct < 0.1) {
        return { action: 'sell', reason: `모멘텀 소멸 (간격 수렴)`, strength: 0.65 };
      }
    }

    return { action: 'hold', reason: '크로스 미발생', strength: 0 };
  }
}

module.exports = MACross;
