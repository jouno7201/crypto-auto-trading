/**
 * 평균 회귀 전략 (Mean Reversion)
 * - 횡보장(ranging)에 최적화 (BTC 시장의 ~57%)
 * - Keltner Channel + RSI + 가격-EMA 괴리율
 * - 밴드 터치 후 중심 회귀 매매
 */

const BaseStrategy = require('./BaseStrategy');
const { ema, rsi, atr, bollingerBands } = require('./indicators');

class MeanReversion extends BaseStrategy {
  constructor(params = {}) {
    super('Mean Reversion', {
      emaPeriod: 20,
      atrPeriod: 14,
      keltnerMult: 1.5,
      rsiPeriod: 14,
      deviationThreshold: 1.5, // ATR 기반 이탈 임계
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { emaPeriod, atrPeriod, keltnerMult, rsiPeriod, deviationThreshold } = this.params;

    const emaValues = ema(closes, emaPeriod);
    const atrValues = atr(candles, atrPeriod);
    const rsiValues = rsi(closes, rsiPeriod);
    const bb = bollingerBands(closes, 20, 2);

    if (emaValues.length < 5 || atrValues.length < 3 || rsiValues.length < 3 || bb.upper.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const currPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 2];
    const currEMA = emaValues[emaValues.length - 1];
    const prevEMA = emaValues[emaValues.length - 2];
    const currATR = atrValues[atrValues.length - 1];
    const currRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];

    // Keltner Channel
    const upperKC = currEMA + currATR * keltnerMult;
    const lowerKC = currEMA - currATR * keltnerMult;
    const prevUpperKC = prevEMA + atrValues[atrValues.length - 2] * keltnerMult;
    const prevLowerKC = prevEMA - atrValues[atrValues.length - 2] * keltnerMult;

    // 가격-EMA 괴리율 (ATR 정규화)
    const deviation = currATR > 0 ? (currPrice - currEMA) / currATR : 0;
    const prevDeviation =
      atrValues[atrValues.length - 2] > 0 ? (prevPrice - prevEMA) / atrValues[atrValues.length - 2] : 0;

    // BB %B
    const bbLen = bb.upper.length;
    const percentB =
      bb.upper[bbLen - 1] - bb.lower[bbLen - 1] > 0
        ? (currPrice - bb.lower[bbLen - 1]) / (bb.upper[bbLen - 1] - bb.lower[bbLen - 1])
        : 0.5;

    // 회귀 방향 확인 (현재 가격이 EMA 쪽으로 움직이는지)
    const returningToMean = Math.abs(deviation) < Math.abs(prevDeviation);

    // ========== 매수 (과매도 → 평균 회귀) ==========

    // 1) 하단 Keltner 이탈 후 진입 복귀 + RSI 과매도 반등
    if (prevPrice <= prevLowerKC && currPrice > lowerKC && currPrice > prevPrice) {
      if (currRSI < 45 && currRSI > prevRSI) {
        const depthBonus = Math.min(Math.abs(deviation) * 0.15, 0.2);
        return { action: 'buy', reason: `KC 하단 복귀 (괴리:${deviation.toFixed(2)}ATR)`, strength: 0.8 + depthBonus };
      }
    }

    // 2) 강한 하방 이탈 (> 1.5 ATR) + 반등 시작
    if (deviation < -deviationThreshold && returningToMean && currRSI > prevRSI) {
      if (currRSI < 40) {
        return {
          action: 'buy',
          reason: `평균회귀 매수 (괴리:${deviation.toFixed(2)}ATR, RSI:${currRSI.toFixed(0)})`,
          strength: 0.85,
        };
      }
    }

    // 3) BB 하단 + KC 하단 동시 근접 (더블 컨펌)
    if (percentB < 0.1 && currPrice < lowerKC * 1.005) {
      if (currRSI < 35 && currRSI > prevRSI) {
        return { action: 'buy', reason: `BB+KC 하단 동시 (%%B:${percentB.toFixed(2)})`, strength: 0.9 };
      }
    }

    // 4) EMA 근접 + RSI 중립 반등 (약한 회귀 신호)
    if (Math.abs(deviation) < 0.5 && prevDeviation < -0.8 && currRSI > 40 && currRSI < 55) {
      if (currPrice > prevPrice && currRSI > prevRSI) {
        return { action: 'buy', reason: `EMA 회귀완료 반등`, strength: 0.65 };
      }
    }

    // ========== 매도 (과매수 → 평균 회귀) ==========

    // 5) 상단 Keltner 이탈 후 진입 복귀
    if (prevPrice >= prevUpperKC && currPrice < upperKC && currPrice < prevPrice) {
      if (currRSI > 55 && currRSI < prevRSI) {
        const depthBonus = Math.min(Math.abs(deviation) * 0.15, 0.2);
        return { action: 'sell', reason: `KC 상단 복귀 (괴리:${deviation.toFixed(2)}ATR)`, strength: 0.8 + depthBonus };
      }
    }

    // 6) 강한 상방 이탈 (> 1.5 ATR) + 하락 시작
    if (deviation > deviationThreshold && returningToMean && currRSI < prevRSI) {
      if (currRSI > 60) {
        return {
          action: 'sell',
          reason: `평균회귀 매도 (괴리:${deviation.toFixed(2)}ATR, RSI:${currRSI.toFixed(0)})`,
          strength: 0.85,
        };
      }
    }

    // 7) BB 상단 + KC 상단 동시 근접
    if (percentB > 0.9 && currPrice > upperKC * 0.995) {
      if (currRSI > 65 && currRSI < prevRSI) {
        return { action: 'sell', reason: `BB+KC 상단 동시 (%%B:${percentB.toFixed(2)})`, strength: 0.9 };
      }
    }

    // 8) EMA 근접 + RSI 중립 반락
    if (Math.abs(deviation) < 0.5 && prevDeviation > 0.8 && currRSI > 45 && currRSI < 60) {
      if (currPrice < prevPrice && currRSI < prevRSI) {
        return { action: 'sell', reason: `EMA 회귀완료 반락`, strength: 0.65 };
      }
    }

    return { action: 'hold', reason: `회귀 대기 (괴리:${deviation.toFixed(2)}ATR)`, strength: 0 };
  }
}

module.exports = MeanReversion;
