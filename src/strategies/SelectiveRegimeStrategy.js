const BaseStrategy = require('./BaseStrategy');
const MeanReversion = require('./MeanReversion');
const SmartRange = require('./SmartRange');
const { detectMarketState } = require('./marketDetector');

class SelectiveRegimeStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('Selective Regime', {
      minTrendConfidence: 0.58,
      minRangeConfidence: 0.52,
      maxVolatilityRatio: 1.45,
      minRangeWidth: 1.0,
      maxRangeWidth: 6.5,
      trendSignalMin: 0.6,
      rangeSignalMin: 0.58,
      fallbackSignalMin: 0.68,
      mrKeltnerMult: 1.8,
      mrDeviationThreshold: 1.1,
      srProximityPct: 0.25,
      ...params,
    });

    this._initSubStrategies();
  }

  _initSubStrategies() {
    const p = this.params;
    this.meanReversion = new MeanReversion({
      keltnerMult: p.mrKeltnerMult,
      deviationThreshold: p.mrDeviationThreshold,
      trendFilterADX: 26,
    });
    this.smartRange = new SmartRange({
      srProximityPct: p.srProximityPct,
      minRangeWidth: p.minRangeWidth,
      maxRangeWidth: p.maxRangeWidth,
      maxADX: 24,
    });
  }

  analyze(candles) {
    if (candles.length < 80) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const market = detectMarketState(candles);
    const rangeWidth = market.rangeBound?.widthPercent || 0;

    if (market.state === 'volatile' || market.volatilityRatio >= this.params.maxVolatilityRatio) {
      return {
        action: 'hold',
        reason: `선택형 관망 (변동성 과다 ${market.volatilityRatio.toFixed(2)}x)`,
        strength: 0,
      };
    }

    if (market.state === 'trending-down' && market.stateConfidence >= this.params.minTrendConfidence) {
      const defensiveExit = this._getDefensiveExit(candles);
      if (defensiveExit) return defensiveExit;
      return {
        action: 'hold',
        reason: `현물 하락장 회피 (신뢰도:${market.stateConfidence.toFixed(2)})`,
        strength: 0,
      };
    }

    if (market.state === 'trending-up' && market.stateConfidence >= this.params.minTrendConfidence) {
      return this._handleTrendingUp(candles, market);
    }

    if (
      market.state === 'ranging' &&
      market.stateConfidence >= this.params.minRangeConfidence &&
      rangeWidth >= this.params.minRangeWidth &&
      rangeWidth <= this.params.maxRangeWidth
    ) {
      return this._handleRanging(candles, market);
    }

    return {
      action: 'hold',
      reason: `선택형 관망 (${market.state}, 신뢰도:${market.stateConfidence.toFixed(2)})`,
      strength: 0,
    };
  }

  _handleTrendingUp(candles, market) {
    const mrSignal = this.meanReversion.analyze(candles);
    const srSignal = this.smartRange.analyze(candles);
    const agreedBuy = mrSignal.action === 'buy' && srSignal.action === 'buy';
    if (agreedBuy && mrSignal.strength >= this.params.rangeSignalMin) {
      return {
        action: 'buy',
        reason: `선택형 상승 눌림목 (${mrSignal.reason})`,
        strength: Math.min(1, mrSignal.strength + 0.08 + Math.min(0.08, market.diRatio * 0.15)),
      };
    }

    if (mrSignal.action === 'buy' && mrSignal.strength >= this.params.trendSignalMin) {
      return {
        action: 'buy',
        reason: `선택형 상승 눌림목 (${mrSignal.reason})`,
        strength: Math.min(1, mrSignal.strength + Math.min(0.05, market.diRatio * 0.12)),
      };
    }

    const defensiveExit = this._getDefensiveExit(candles);
    if (defensiveExit) {
      return {
        action: 'sell',
        reason: `선택형 상승 청산 (${defensiveExit.reason})`,
        strength: defensiveExit.strength,
      };
    }

    return { action: 'hold', reason: `상승 추세 눌림목 대기`, strength: 0 };
  }

  _handleRanging(candles, market) {
    const mrSignal = this.meanReversion.analyze(candles);
    const srSignal = this.smartRange.analyze(candles);

    if (mrSignal.action !== 'hold' && mrSignal.action === srSignal.action) {
      return {
        action: mrSignal.action,
        reason: `선택형 레인지 합의 (${mrSignal.reason} + ${srSignal.reason})`,
        strength: Math.min(1, Math.max(mrSignal.strength, srSignal.strength) + 0.1),
      };
    }

    if (mrSignal.action !== 'hold' && mrSignal.strength >= this.params.rangeSignalMin) {
      return {
        action: mrSignal.action,
        reason: `선택형 레인지 주전략 (${mrSignal.reason})`,
        strength: Math.min(1, mrSignal.strength + (market.stateConfidence > 0.65 ? 0.05 : 0)),
      };
    }

    if (srSignal.action !== 'hold' && srSignal.strength >= this.params.fallbackSignalMin) {
      return {
        action: srSignal.action,
        reason: `선택형 레인지 보조 (${srSignal.reason})`,
        strength: srSignal.strength,
      };
    }

    if (mrSignal.action !== 'hold' && srSignal.action !== 'hold' && mrSignal.action !== srSignal.action) {
      return { action: 'hold', reason: '선택형 레인지 충돌', strength: 0 };
    }

    return {
      action: 'hold',
      reason: `선택형 레인지 대기 (MR:${mrSignal.action}, SR:${srSignal.action})`,
      strength: 0,
    };
  }

  _getDefensiveExit(candles) {
    const mrSignal = this.meanReversion.analyze(candles);
    const srSignal = this.smartRange.analyze(candles);
    const sellSignals = [mrSignal, srSignal]
      .filter((signal) => signal.action === 'sell')
      .sort((left, right) => right.strength - left.strength);

    if (sellSignals.length > 0 && sellSignals[0].strength >= this.params.rangeSignalMin) {
      return sellSignals[0];
    }

    return null;
  }
}

module.exports = SelectiveRegimeStrategy;
