/**
 * 변동성 돌파 전략 (v3)
 * - 래리 윌리엄스 기반 + 적응형 k값 + 노이즈 필터
 * - 다중 시간 범위 (전일 + 2일) 확인
 * - ATR 기반 트레일링 스탑 + 모멘텀 매도
 */

const BaseStrategy = require('./BaseStrategy');
const { atr, ema, rsi } = require('./indicators');

class VolatilityBreakout extends BaseStrategy {
  constructor(params = {}) {
    super('Volatility Breakout', {
      k: 0.5,
      noiseMaxRatio: 0.8,
      noiseLookback: 20,
      atrMultiplier: 2.0,
      ...params,
    });
  }

  analyze(candles) {
    if (candles.length < 30) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const { k, noiseMaxRatio, noiseLookback, atrMultiplier } = this.params;

    const prev = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];
    const curr = candles[candles.length - 1];

    const range1 = prev.high - prev.low;
    const range2 = prev2.high - prev2.low;
    const avgRange = (range1 + range2) / 2;
    const targetPrice = curr.open + avgRange * k;

    // 적응형 k: 추세 방향이 명확하면 k를 낮추어 진입 쉽게
    const closes = candles.map((c) => c.close);
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const rsiValues = rsi(closes, 14);
    const currEMA20 = ema20.length > 0 ? ema20[ema20.length - 1] : curr.close;
    const currEMA50 = ema50.length > 0 ? ema50[ema50.length - 1] : curr.close;
    const isUptrend = currEMA20 > currEMA50;
    const currRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;

    // 노이즈 비율 계산
    const recentCandles = candles.slice(-noiseLookback);
    let noiseSum = 0;
    for (const c of recentCandles) {
      const body = Math.abs(c.close - c.open);
      const wick = c.high - c.low;
      noiseSum += wick > 0 ? 1 - body / wick : 1;
    }
    const noiseRatio = noiseSum / recentCandles.length;

    // ATR 계산
    const atrValues = atr(candles, 14);
    const currATR = atrValues.length > 0 ? atrValues[atrValues.length - 1] : avgRange;

    // ========== 매수 ==========

    // 1) 목표가 돌파 + 노이즈 통과
    if (curr.close > targetPrice && avgRange > 0) {
      const passNoise = noiseRatio < noiseMaxRatio;
      const passTrend = isUptrend && noiseRatio < noiseMaxRatio + 0.1;
      if (passNoise || passTrend) {
        const excess = (curr.close - targetPrice) / currATR;
        const trendBonus = isUptrend ? 0.1 : 0;
        const strength = Math.min(excess * 0.4 + 0.55 + trendBonus, 1);
        return {
          action: 'buy',
          reason: `변동성 돌파 (목표:${targetPrice.toFixed(0)}, 노이즈:${noiseRatio.toFixed(2)})`,
          strength,
        };
      }
    }

    // 2) 거짓 돌파 후 재돌파 (전봉이 범위 내로 돌아왔다가 다시 돌파)
    const prevTarget = prev2.open + (candles[candles.length - 4].high - candles[candles.length - 4].low) * k;
    if (prev.close < prevTarget && curr.close > targetPrice && isUptrend) {
      if (noiseRatio < noiseMaxRatio && currRSI > 45 && currRSI < 70) {
        return { action: 'buy', reason: `변동성 재돌파 (모멘텀 복귀)`, strength: 0.75 };
      }
    }

    // ========== 매도 ==========

    // 3) ATR 기반 트레일링 스탑 하향 이탈
    const recent = candles.slice(-10);
    const recentHigh = Math.max(...recent.map((c) => c.high));
    const stopPrice = recentHigh - currATR * atrMultiplier;

    if (curr.close < stopPrice && curr.close < curr.open) {
      const dropPct = ((recentHigh - curr.close) / recentHigh) * 100;
      const strength = Math.min(dropPct / 4 + 0.5, 1);
      return {
        action: 'sell',
        reason: `ATR 트레일링 스탑 (고점:${recentHigh.toFixed(0)}, 스탑:${stopPrice.toFixed(0)})`,
        strength,
      };
    }

    // 4) 하방 돌파 (하락 변동성 돌파)
    const downTarget = curr.open - avgRange * k;
    if (curr.close < downTarget && avgRange > 0 && !isUptrend) {
      if (noiseRatio < noiseMaxRatio && currRSI < 55) {
        const excess = (downTarget - curr.close) / currATR;
        const strength = Math.min(excess * 0.4 + 0.55, 1);
        return { action: 'sell', reason: `하방 변동성 돌파 (${downTarget.toFixed(0)})`, strength };
      }
    }

    return {
      action: 'hold',
      reason: `돌파 미발생 (목표:${targetPrice.toFixed(0)}, 노이즈:${noiseRatio.toFixed(2)})`,
      strength: 0,
    };
  }
}

module.exports = VolatilityBreakout;
