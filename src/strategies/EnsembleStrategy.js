/**
 * 앙상블 전략 (Ensemble Strategy)
 * - 시장 상태에 따라 MACD(추세장) + MeanReversion(횡보장) 동적 가중 배합
 * - trending → MACD 우세, ranging → MeanReversion 우세
 * - 두 전략이 합의하면 신뢰도 부스트, 충돌하면 주도 전략만 사용
 */

const BaseStrategy = require('./BaseStrategy');
const MACDStrategy = require('./MACDStrategy');
const MeanReversion = require('./MeanReversion');
const { detectMarketState } = require('./marketDetector');

class EnsembleStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('Ensemble', {
      // 추세장 가중치
      trendMACDWeight: 0.75,
      trendMRWeight: 0.25,
      // 횡보장 가중치
      rangeMACDWeight: 0.25,
      rangeMRWeight: 0.75,
      // 변동성장 가중치
      volatileMACDWeight: 0.4,
      volatileMRWeight: 0.6,
      // 합의 부스트
      agreementBoost: 0.1,
      // 충돌 시 최소 강도 (이하 → hold)
      conflictMinStrength: 0.65,
      // 변동성장 최소 강도
      volatileMinStrength: 0.75,
      // MACD 파라미터
      macdFast: 12,
      macdSlow: 26,
      macdSignal: 9,
      // MeanReversion 파라미터
      mrEmaPeriod: 20,
      mrKeltnerMult: 1.5,
      mrDeviationThreshold: 1.5,
      ...params,
    });

    this._initSubStrategies();
  }

  _initSubStrategies() {
    const p = this.params;
    this.macdStrategy = new MACDStrategy({
      fastPeriod: p.macdFast,
      slowPeriod: p.macdSlow,
      signalPeriod: p.macdSignal,
    });
    this.mrStrategy = new MeanReversion({
      emaPeriod: p.mrEmaPeriod,
      keltnerMult: p.mrKeltnerMult,
      deviationThreshold: p.mrDeviationThreshold,
    });
  }

  analyze(candles) {
    if (candles.length < 60) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    // 1) 두 전략의 시그널 수집
    const macdSignal = this.macdStrategy.analyze(candles);
    const mrSignal = this.mrStrategy.analyze(candles);

    // 2) 시장 상태 감지
    const market = detectMarketState(candles);
    const state = market.state;

    // 3) 상태별 가중치 결정
    let wMACD, wMR;
    if (state === 'trending-up' || state === 'trending-down') {
      wMACD = this.params.trendMACDWeight;
      wMR = this.params.trendMRWeight;
    } else if (state === 'volatile') {
      wMACD = this.params.volatileMACDWeight;
      wMR = this.params.volatileMRWeight;
    } else {
      wMACD = this.params.rangeMACDWeight;
      wMR = this.params.rangeMRWeight;
    }

    // 4) 시그널 합성
    return this._combineSignals(macdSignal, mrSignal, wMACD, wMR, state);
  }

  _combineSignals(macdSig, mrSig, wMACD, wMR, marketState) {
    const mAction = macdSig.action;
    const rAction = mrSig.action;
    const mStr = macdSig.strength;
    const rStr = mrSig.strength;

    // 둘 다 hold → hold
    if (mAction === 'hold' && rAction === 'hold') {
      return { action: 'hold', reason: `앙상블 대기 [${marketState}]`, strength: 0 };
    }

    // 두 전략이 같은 방향 → 합의 (높은 신뢰도)
    if (mAction === rAction && mAction !== 'hold') {
      const combined = Math.min(1, mStr * wMACD + rStr * wMR + this.params.agreementBoost);
      const leader = wMACD >= wMR ? macdSig.reason : mrSig.reason;
      return {
        action: mAction,
        reason: `앙상블 합의 [${marketState}] ${leader}`,
        strength: combined,
      };
    }

    // 하나만 활성 (다른 하나는 hold)
    if (mAction !== 'hold' && rAction === 'hold') {
      const strength = mStr * wMACD;
      if (marketState === 'volatile' && strength < this.params.volatileMinStrength) {
        return { action: 'hold', reason: `앙상블 억제-변동성 [${marketState}]`, strength: 0 };
      }
      if (strength < 0.3) {
        return { action: 'hold', reason: `앙상블 약신호 필터 [${marketState}]`, strength: 0 };
      }
      return {
        action: mAction,
        reason: `앙상블→MACD [${marketState}] ${macdSig.reason}`,
        strength: Math.min(1, strength + mStr * 0.3),
      };
    }

    if (rAction !== 'hold' && mAction === 'hold') {
      const strength = rStr * wMR;
      if (marketState === 'volatile' && strength < this.params.volatileMinStrength) {
        return { action: 'hold', reason: `앙상블 억제 (변동성장) [${marketState}]`, strength: 0 };
      }
      if (strength < 0.3) {
        return { action: 'hold', reason: `앙상블 약신호 필터 [${marketState}]`, strength: 0 };
      }
      return {
        action: rAction,
        reason: `앙상블→MR [${marketState}] ${mrSig.reason}`,
        strength: Math.min(1, strength + rStr * 0.3),
      };
    }

    // 충돌 (하나 buy, 하나 sell) → 시장 주도 전략의 시그널 채택
    const macdScore = mStr * wMACD;
    const mrScore = rStr * wMR;
    const dominant = macdScore >= mrScore ? macdSig : mrSig;
    const dominantScore = Math.max(macdScore, mrScore);

    if (dominantScore < this.params.conflictMinStrength) {
      return { action: 'hold', reason: `앙상블 충돌→관망 [${marketState}]`, strength: 0 };
    }

    return {
      action: dominant.action,
      reason: `앙상블 충돌→${macdScore >= mrScore ? 'MACD' : 'MR'} [${marketState}] ${dominant.reason}`,
      strength: Math.min(1, dominantScore),
    };
  }
}

module.exports = EnsembleStrategy;
