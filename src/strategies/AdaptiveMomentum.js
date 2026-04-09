/**
 * 적응형 모멘텀 전략 (Adaptive Momentum)
 * - ROC (Rate of Change) + ADX 적응형 임계
 * - 모멘텀 가속/감속으로 진입/청산
 * - 추세장에서 최적, ranging 시 자동 필터링
 */

const BaseStrategy = require('./BaseStrategy');
const { ema, rsi, atr, adx } = require('./indicators');

class AdaptiveMomentum extends BaseStrategy {
  constructor(params = {}) {
    super('Adaptive Momentum', {
      rocPeriod: 10,
      rocSmooth: 3,
      adxPeriod: 14,
      adxThreshold: 20,
      rsiPeriod: 14,
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { rocPeriod, rocSmooth, adxPeriod, adxThreshold, rsiPeriod } = this.params;

    const rsiValues = rsi(closes, rsiPeriod);
    const adxResult = adx(candles, adxPeriod);
    const atrValues = atr(candles, 14);
    const ema50 = ema(closes, 50);

    if (closes.length < rocPeriod + rocSmooth + 5 || adxResult.adx.length < 3 || rsiValues.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    // ROC 계산
    const rocValues = [];
    for (let i = rocPeriod; i < closes.length; i++) {
      rocValues.push(((closes[i] - closes[i - rocPeriod]) / closes[i - rocPeriod]) * 100);
    }

    // ROC 스무딩 (EMA)
    const smoothedROC = ema(rocValues, rocSmooth);
    if (smoothedROC.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const currROC = smoothedROC[smoothedROC.length - 1];
    const prevROC = smoothedROC[smoothedROC.length - 2];
    const prev2ROC = smoothedROC[smoothedROC.length - 3];

    // ADX (추세 강도)
    const currADX = adxResult.adx[adxResult.adx.length - 1];
    const prevADX = adxResult.adx[adxResult.adx.length - 2];
    const currPlusDI = adxResult.plusDI[adxResult.plusDI.length - 1];
    const currMinusDI = adxResult.minusDI[adxResult.minusDI.length - 1];

    const currRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];
    const currPrice = closes[closes.length - 1];
    const currEMA50 = ema50.length > 0 ? ema50[ema50.length - 1] : currPrice;

    // 모멘텀 가속/감속
    const rocAccel = currROC - prevROC;
    const prevAccel = prevROC - prev2ROC;
    const isAccelerating = rocAccel > 0 && currROC > 0;
    const isDecelerating = rocAccel < 0 && currROC > 0;
    const isBearAccel = rocAccel < 0 && currROC < 0;
    const isBearDecel = rocAccel > 0 && currROC < 0;

    // 적응형 임계: ADX가 높으면 (추세 강하면) 임계 낮추기
    const adaptiveThreshold = currADX > 30 ? 0.3 : currADX > 20 ? 0.6 : 1.0;

    const isTrending = currADX >= adxThreshold;
    const bullishDI = currPlusDI > currMinusDI;

    // ========== 매수 ==========

    // 1) 모멘텀 가속 + 추세 존재 + 상승 DI
    if (isAccelerating && isTrending && bullishDI) {
      if (currROC > adaptiveThreshold) {
        const strength = Math.min(currROC / 3 + 0.6, 1);
        return {
          action: 'buy',
          reason: `모멘텀 가속 (ROC:${currROC.toFixed(2)}%, ADX:${currADX.toFixed(0)})`,
          strength,
        };
      }
    }

    // 2) 음수→양수 ROC 전환 + ADX 상승 (추세 시작)
    if (prevROC <= 0 && currROC > 0 && currADX > prevADX && bullishDI) {
      const strength = Math.min(Math.abs(currROC) / 2 + 0.65, 1);
      return { action: 'buy', reason: `모멘텀 전환 (ROC:${prevROC.toFixed(2)}→${currROC.toFixed(2)}%)`, strength };
    }

    // 3) 하락 감속 → 반전 조짐 (베어 모멘텀 약해지며 RSI 반등)
    if (isBearDecel && currRSI > prevRSI && currRSI < 45) {
      if (currPrice > currEMA50 || currROC > -0.5) {
        return { action: 'buy', reason: `하락모멘텀 소멸 (ROC:${currROC.toFixed(2)}%)`, strength: 0.7 };
      }
    }

    // 4) 강한 모멘텀 지속 (ROC > 1% + 추세 + RSI 적정)
    if (currROC > 1.0 && isTrending && currRSI > 45 && currRSI < 70) {
      if (prevROC > 0.5) {
        return { action: 'buy', reason: `강한 모멘텀 지속 (ROC:${currROC.toFixed(2)}%)`, strength: 0.75 };
      }
    }

    // ========== 매도 ==========

    // 5) 베어 모멘텀 가속 + 추세 + 하락 DI
    if (isBearAccel && isTrending && !bullishDI) {
      if (Math.abs(currROC) > adaptiveThreshold) {
        const strength = Math.min(Math.abs(currROC) / 3 + 0.6, 1);
        return {
          action: 'sell',
          reason: `하락모멘텀 가속 (ROC:${currROC.toFixed(2)}%, ADX:${currADX.toFixed(0)})`,
          strength,
        };
      }
    }

    // 6) 양수→음수 ROC 전환 + ADX 상승
    if (prevROC >= 0 && currROC < 0 && currADX > prevADX && !bullishDI) {
      const strength = Math.min(Math.abs(currROC) / 2 + 0.65, 1);
      return { action: 'sell', reason: `모멘텀 하락전환 (ROC:${prevROC.toFixed(2)}→${currROC.toFixed(2)}%)`, strength };
    }

    // 7) 상승 감속 → 반전 조짐
    if (isDecelerating && currRSI < prevRSI && currRSI > 55) {
      if (currPrice < currEMA50 || currROC < 0.5) {
        return { action: 'sell', reason: `상승모멘텀 소멸 (ROC:${currROC.toFixed(2)}%)`, strength: 0.7 };
      }
    }

    // 8) 강한 하락 모멘텀 지속
    if (currROC < -1.0 && isTrending && currRSI > 30 && currRSI < 55) {
      if (prevROC < -0.5) {
        return { action: 'sell', reason: `강한 하락모멘텀 (ROC:${currROC.toFixed(2)}%)`, strength: 0.75 };
      }
    }

    return {
      action: 'hold',
      reason: `모멘텀 중립 (ROC:${currROC.toFixed(2)}%, ADX:${currADX.toFixed(0)})`,
      strength: 0,
    };
  }
}

module.exports = AdaptiveMomentum;
