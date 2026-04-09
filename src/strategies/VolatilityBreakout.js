/**
 * 변동성 돌파 전략 (개선판)
 * - 래리 윌리엄스 기반 + 노이즈 비율 필터
 * - 노이즈 비율이 낮을 때만 진입 (추세가 깨끗한 시장)
 * - ATR 기반 트레일링 스탑으로 매도
 * - k값 자동 조정
 */

const BaseStrategy = require('./BaseStrategy');
const { atr, ema } = require('./indicators');

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
    if (candles.length < 25) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const { k, noiseMaxRatio, noiseLookback, atrMultiplier } = this.params;

    const prev = candles[candles.length - 2];
    const curr = candles[candles.length - 1];

    const range = prev.high - prev.low;
    const targetPrice = curr.open + range * k;

    // 노이즈 비율 계산: |close - open| / (high - low)
    // 낮을수록 추세가 깨끗 (0 = 추세 완벽, 1 = 무방향)
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
    const currATR = atrValues.length > 0 ? atrValues[atrValues.length - 1] : range;

    // EMA 추세 확인
    const closes = candles.map((c) => c.close);
    const ema20 = ema(closes, 20);
    const currEMA = ema20.length > 0 ? ema20[ema20.length - 1] : curr.close;
    const isUptrend = curr.close > currEMA;

    // 매수: 목표가 돌파 + 노이즈 낮음 (+ 추세 확인 시 노이즈 조건 완화)
    if (curr.close > targetPrice && range > 0) {
      const passNoise = noiseRatio < noiseMaxRatio;
      const passTrend = isUptrend && noiseRatio < noiseMaxRatio + 0.1;
      if (passNoise || passTrend) {
        const excess = (curr.close - targetPrice) / currATR;
        const trendBonus = isUptrend ? 0.1 : 0;
        const strength = Math.min(excess * 0.5 + 0.4 + trendBonus, 1);
        return {
          action: 'buy',
          reason: `변동성 돌파 (목표:${targetPrice.toFixed(0)}, 노이즈:${noiseRatio.toFixed(2)}${isUptrend ? ', 상승추세' : ''})`,
          strength,
        };
      }
    }

    // 매도: ATR 기반 트레일링 스탑 하향 이탈
    // 최근 고점에서 ATR * multiplier 만큼 하락하면 매도
    const recent = candles.slice(-10);
    const recentHigh = Math.max(...recent.map((c) => c.high));
    const stopPrice = recentHigh - currATR * atrMultiplier;

    if (curr.close < stopPrice && curr.close < curr.open) {
      const dropPct = ((recentHigh - curr.close) / recentHigh) * 100;
      const strength = Math.min(dropPct / 5 + 0.3, 1);
      return {
        action: 'sell',
        reason: `ATR 트레일링 스탑 (고점:${recentHigh.toFixed(0)}, 스탑:${stopPrice.toFixed(0)})`,
        strength,
      };
    }

    return {
      action: 'hold',
      reason: `돌파 미발생 (목표:${targetPrice.toFixed(0)}, 노이즈:${noiseRatio.toFixed(2)})`,
      strength: 0,
    };
  }
}

module.exports = VolatilityBreakout;
