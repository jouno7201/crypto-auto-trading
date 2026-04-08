/**
 * 이동평균 크로스 전략 (개선판)
 * - EMA 기반 (SMA보다 빠른 반응)
 * - 200 EMA 추세 필터: 상승 추세에서만 매수, 하락 추세에서만 매도
 * - 단기 9 / 장기 21 (기본값, 변경 가능)
 */

const BaseStrategy = require('./BaseStrategy');
const { ema } = require('./indicators');

class MACross extends BaseStrategy {
  constructor(params = {}) {
    super('MA Cross', {
      shortPeriod: 9,
      longPeriod: 21,
      trendPeriod: 200,
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { shortPeriod, longPeriod, trendPeriod } = this.params;

    const shortMA = ema(closes, shortPeriod);
    const longMA = ema(closes, longPeriod);
    const trendMA = ema(closes, trendPeriod);

    if (shortMA.length < 2 || longMA.length < 2) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    // 길이 맞추기 (longMA 기준)
    const sOff = shortMA.length - longMA.length;
    const prevShort = shortMA[shortMA.length - 2 - 0];
    const currShort = shortMA[shortMA.length - 1];
    const prevLong = longMA[longMA.length - 2];
    const currLong = longMA[longMA.length - 1];
    const currPrice = closes[closes.length - 1];

    // 추세 필터 (trendMA가 있으면 사용)
    const hasTrend = trendMA.length > 0;
    const currTrend = hasTrend ? trendMA[trendMA.length - 1] : 0;
    const isUptrend = !hasTrend || currPrice > currTrend;
    const isDowntrend = !hasTrend || currPrice < currTrend;

    // 골든 크로스 (상향 돌파) + 상승 추세
    if (prevShort <= prevLong && currShort > currLong && isUptrend) {
      const gap = ((currShort - currLong) / currLong) * 100;
      const strength = Math.min(gap * 2 + 0.3, 1);
      return {
        action: 'buy',
        reason: `골든크로스 EMA${shortPeriod}/${longPeriod}${hasTrend ? ' (상승추세)' : ''}`,
        strength,
      };
    }

    // 데드 크로스 (하향 돌파) + 하락 추세
    if (prevShort >= prevLong && currShort < currLong && isDowntrend) {
      const gap = ((currLong - currShort) / currLong) * 100;
      const strength = Math.min(gap * 2 + 0.3, 1);
      return {
        action: 'sell',
        reason: `데드크로스 EMA${shortPeriod}/${longPeriod}${hasTrend ? ' (하락추세)' : ''}`,
        strength,
      };
    }

    return { action: 'hold', reason: '크로스 미발생', strength: 0 };
  }
}

module.exports = MACross;
