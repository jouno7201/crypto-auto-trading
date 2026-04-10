/**
 * 앙상블 전략 v2 (Ensemble Strategy)
 * - 시장 상태에 따라 MACD(추세장) + MeanReversion(횡보장) 동적 가중 배합
 * - v2: ADX 값 기반 연속 가중치 (퍼지), 신뢰도 기반 필터, 개선된 충돌 처리
 */

const BaseStrategy = require('./BaseStrategy');
const MACDStrategy = require('./MACDStrategy');
const MeanReversion = require('./MeanReversion');
const { detectMarketState } = require('./marketDetector');

class EnsembleStrategy extends BaseStrategy {
  constructor(params = {}) {
    super('Ensemble', {
      // v2: ADX 기반 연속 가중치 범위 (이산 카테고리 대체)
      macdWeightMin: 0.2, // 강한 횡보장에서 MACD 최소 가중치
      macdWeightMax: 0.8, // 강한 추세장에서 MACD 최대 가중치
      adxLow: 15, // ADX <= 15: 완전 횡보 (MR 우세)
      adxHigh: 35, // ADX >= 35: 완전 추세 (MACD 우세)
      // 합의 부스트
      agreementBoost: 0.12,
      // 충돌 시 최소 강도 (이하 → hold)
      conflictMinStrength: 0.55, // v2: 0.65→0.55 (덜 보수적)
      // 변동성장 감쇠/최소 강도
      volatileDamp: 0.6,
      volatileMinStrength: 0.65,
      // 최소 시그널 품질 (이하 → hold)
      minSignalQuality: 0.35,
      // MACD 파라미터
      macdFast: 12,
      macdSlow: 21, // v2: WF 최적값 유지
      macdSignal: 7,
      // MeanReversion 파라미터
      mrEmaPeriod: 20,
      mrKeltnerMult: 2.0, // v2: MR v2 기본값
      mrDeviationThreshold: 1.2,
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

    // 3) v2: ADX 기반 연속 가중치 계산 (퍼지 보간)
    const { wMACD, wMR } = this._calcAdaptiveWeights(market);

    // 4) 시그널 합성
    return this._combineSignals(macdSignal, mrSignal, wMACD, wMR, market);
  }

  /**
   * v2: ADX 값에 따라 MACD/MR 가중치를 연속적으로 보간
   * - ADX <= adxLow → MACD=min, MR=max (횡보)
   * - ADX >= adxHigh → MACD=max, MR=min (추세)
   * - 사이 구간 → 선형 보간
   * - volatile → 고정 감쇠
   */
  _calcAdaptiveWeights(market) {
    const { macdWeightMin, macdWeightMax, adxLow, adxHigh, volatileDamp } = this.params;
    const adxVal = market.adx;

    let wMACD;
    if (market.state === 'volatile') {
      // 변동성장: 둘 다 약하게 (MR 약간 우세)
      wMACD = 0.35 * volatileDamp;
    } else if (adxVal <= adxLow) {
      wMACD = macdWeightMin;
    } else if (adxVal >= adxHigh) {
      wMACD = macdWeightMax;
    } else {
      // 선형 보간
      const t = (adxVal - adxLow) / (adxHigh - adxLow);
      wMACD = macdWeightMin + t * (macdWeightMax - macdWeightMin);
    }

    // 시장 신뢰도가 낮으면 가중치를 중간(0.5)에 가깝게 조정
    const confidence = market.stateConfidence || 0.5;
    if (confidence < 0.5) {
      const blend = confidence / 0.5; // 0~1
      wMACD = 0.5 + (wMACD - 0.5) * blend;
    }

    const wMR = 1 - wMACD;
    return { wMACD, wMR };
  }

  _combineSignals(macdSig, mrSig, wMACD, wMR, market) {
    const mAction = macdSig.action;
    const rAction = mrSig.action;
    const mStr = macdSig.strength;
    const rStr = mrSig.strength;
    const marketState = market.state;
    const confidence = market.stateConfidence || 0.5;

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
      const strength = mStr * wMACD + mStr * 0.2; // 단독 시 약간 보정
      if (marketState === 'volatile' && strength < this.params.volatileMinStrength) {
        return { action: 'hold', reason: `앙상블 억제-변동성 [${marketState}]`, strength: 0 };
      }
      if (strength < this.params.minSignalQuality) {
        return { action: 'hold', reason: `앙상블 약신호 필터 [${marketState}]`, strength: 0 };
      }
      return {
        action: mAction,
        reason: `앙상블→MACD [${marketState}] ${macdSig.reason}`,
        strength: Math.min(1, strength),
      };
    }

    if (rAction !== 'hold' && mAction === 'hold') {
      const strength = rStr * wMR + rStr * 0.2;
      if (marketState === 'volatile' && strength < this.params.volatileMinStrength) {
        return { action: 'hold', reason: `앙상블 억제 (변동성장) [${marketState}]`, strength: 0 };
      }
      if (strength < this.params.minSignalQuality) {
        return { action: 'hold', reason: `앙상블 약신호 필터 [${marketState}]`, strength: 0 };
      }
      return {
        action: rAction,
        reason: `앙상블→MR [${marketState}] ${mrSig.reason}`,
        strength: Math.min(1, strength),
      };
    }

    // 충돌 (하나 buy, 하나 sell) → 시장 주도 전략 채택
    const macdScore = mStr * wMACD;
    const mrScore = rStr * wMR;
    const dominant = macdScore >= mrScore ? macdSig : mrSig;
    const dominantScore = Math.max(macdScore, mrScore);
    // v2: 충돌 시 시장 신뢰도가 높으면 주도 전략 신뢰, 낮으면 관망
    const conflictThreshold = this.params.conflictMinStrength * (confidence > 0.6 ? 0.8 : 1.0);

    if (dominantScore < conflictThreshold) {
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
