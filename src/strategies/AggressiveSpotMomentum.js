const BaseStrategy = require('./BaseStrategy');
const { ema, rsi, atr, macd, stochastic, adx } = require('./indicators');
const { detectMarketState } = require('./marketDetector');

class AggressiveSpotMomentum extends BaseStrategy {
  constructor(params = {}) {
    super('Aggressive Spot Momentum', {
      fastEma: 12,
      slowEma: 36,
      trendEma: 96,
      breakoutLookback: 20,
      breakoutBufferPct: 0.15,
      rsiPeriod: 14,
      rsiEntry: 54,
      rsiExit: 47,
      rsiOverheat: 78,
      adxPeriod: 14,
      adxEntry: 18,
      atrPeriod: 14,
      minAtrPercent: 0.35,
      stochPeriod: 14,
      stochSignal: 3,
      volumeLookback: 10,
      ...params,
    });
  }

  analyze(candles) {
    const need = Math.max(this.params.trendEma + 5, this.params.breakoutLookback + 10, 120);
    if (candles.length < need) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const closes = candles.map((c) => c.close);
    const fastEma = ema(closes, this.params.fastEma);
    const slowEma = ema(closes, this.params.slowEma);
    const trendEma = ema(closes, this.params.trendEma);
    const rsiValues = rsi(closes, this.params.rsiPeriod);
    const atrValues = atr(candles, this.params.atrPeriod);
    const macdResult = macd(closes, 8, 21, 6);
    const stoch = stochastic(candles, this.params.stochPeriod, this.params.stochSignal);
    const adxResult = adx(candles, this.params.adxPeriod);

    if (
      fastEma.length < 3 ||
      slowEma.length < 3 ||
      trendEma.length < 3 ||
      rsiValues.length < 3 ||
      atrValues.length < 2 ||
      macdResult.histogram.length < 3 ||
      stoch.k.length < 3 ||
      stoch.d.length < 2 ||
      adxResult.adx.length < 2
    ) {
      return { action: 'hold', reason: '지표 부족', strength: 0 };
    }

    const market = detectMarketState(candles);
    const currPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 2];
    const currFast = fastEma[fastEma.length - 1];
    const prevFast = fastEma[fastEma.length - 2];
    const currSlow = slowEma[slowEma.length - 1];
    const currTrend = trendEma[trendEma.length - 1];
    const currRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];
    const currATR = atrValues[atrValues.length - 1];
    const atrPercent = currPrice > 0 ? (currATR / currPrice) * 100 : 0;
    const currHist = macdResult.histogram[macdResult.histogram.length - 1];
    const prevHist = macdResult.histogram[macdResult.histogram.length - 2];
    const currMacd = macdResult.macdLine[macdResult.macdLine.length - 1];
    const currSignal = macdResult.signalLine[macdResult.signalLine.length - 1];
    const currK = stoch.k[stoch.k.length - 1];
    const prevK = stoch.k[stoch.k.length - 2];
    const currD = stoch.d[stoch.d.length - 1];
    const prevD = stoch.d[stoch.d.length - 2];
    const currADX = adxResult.adx[adxResult.adx.length - 1];
    const prevADX = adxResult.adx[adxResult.adx.length - 2];

    const isBullTrend = currPrice > currTrend && currFast > currSlow && currSlow > currTrend;
    const isTrendWeak = currPrice < currFast && currFast < currSlow;
    const isMomentumPositive = currMacd > currSignal && currHist > 0 && currHist >= prevHist;
    const isMomentumRollingOver = currMacd < currSignal && currHist < prevHist;
    const breakoutBase = Math.max(...candles.slice(-(this.params.breakoutLookback + 1), -1).map((c) => c.high));
    const breakoutLevel = breakoutBase * (1 + this.params.breakoutBufferPct / 100);
    const touchedPullback = candles[candles.length - 2].low <= prevFast * 1.002;
    const recoveredPullback = currPrice > currFast && prevPrice <= prevFast;
    const stochUp = prevK <= prevD && currK > currD;
    const volumeConfirmed = this._volumeConfirmed(candles);

    if (market.state === 'trending-down' && market.stateConfidence >= 0.55) {
      return {
        action: 'sell',
        reason: `하락추세 회피 (${market.details})`,
        strength: 0.82,
      };
    }

    if (atrPercent < this.params.minAtrPercent) {
      return { action: 'hold', reason: `변동성 부족 (${atrPercent.toFixed(2)}%)`, strength: 0 };
    }

    if (market.state === 'volatile' && currPrice < currFast) {
      return { action: 'sell', reason: `고변동 약세 회피 (${market.details})`, strength: 0.74 };
    }

    if (
      isBullTrend &&
      currPrice >= breakoutLevel &&
      currRSI >= this.params.rsiEntry &&
      currRSI <= this.params.rsiOverheat &&
      currADX >= this.params.adxEntry &&
      currADX >= prevADX &&
      isMomentumPositive
    ) {
      let strength = 0.72;
      if (volumeConfirmed) strength += 0.06;
      if (market.state === 'trending-up') strength += 0.06;
      if (currADX >= 25) strength += 0.05;
      return {
        action: 'buy',
        reason: `상승 돌파 추종 (돌파:${breakoutLevel.toFixed(0)}, RSI:${currRSI.toFixed(0)}, ADX:${currADX.toFixed(0)})`,
        strength: Math.min(1, strength),
      };
    }

    if (
      isBullTrend &&
      touchedPullback &&
      recoveredPullback &&
      currRSI > 50 &&
      currRSI > prevRSI &&
      stochUp &&
      currK < 80 &&
      currADX >= this.params.adxEntry - 2
    ) {
      let strength = 0.66;
      if (isMomentumPositive) strength += 0.06;
      if (volumeConfirmed) strength += 0.04;
      return {
        action: 'buy',
        reason: `눌림목 재가속 (EMA${this.params.fastEma} 회복, RSI:${currRSI.toFixed(0)})`,
        strength: Math.min(1, strength),
      };
    }

    if (currRSI >= this.params.rsiOverheat + 4 && currHist < prevHist && currK > 88 && currPrice > currFast * 1.025) {
      return {
        action: 'sell',
        reason: `과열 이익보호 (RSI:${currRSI.toFixed(0)}, Stoch:${currK.toFixed(0)})`,
        strength: 0.7,
      };
    }

    if (isTrendWeak && currRSI <= this.params.rsiExit && isMomentumRollingOver) {
      return {
        action: 'sell',
        reason: `추세 이탈 청산 (RSI:${currRSI.toFixed(0)}, MACD 약화)`,
        strength: 0.76,
      };
    }

    if (currPrice < currTrend && currRSI < 50 && currHist < 0) {
      return {
        action: 'sell',
        reason: `장기추세 하회 청산 (EMA${this.params.trendEma} 이탈)`,
        strength: 0.68,
      };
    }

    return {
      action: 'hold',
      reason: `공격형 대기 (${market.state}, RSI:${currRSI.toFixed(0)}, ADX:${currADX.toFixed(0)})`,
      strength: 0,
    };
  }

  _volumeConfirmed(candles) {
    const current = candles[candles.length - 1];
    if (current.volume == null) return true;

    const recent = candles.slice(-(this.params.volumeLookback + 1), -1).map((c) => c.volume || 0);
    if (recent.length === 0) return true;
    const avg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    return avg === 0 || current.volume >= avg * 0.9;
  }
}

module.exports = AggressiveSpotMomentum;
