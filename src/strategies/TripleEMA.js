/**
 * 트리플 EMA 모멘텀 전략
 * - 3 EMA (9/21/55) 정렬 상태로 추세 강도 판단
 * - 스토캐스틱으로 과매수/과매도 타이밍
 * - ATR로 변동성 확인 (변동성 너무 낮으면 진입 X)
 */

const BaseStrategy = require('./BaseStrategy');
const { ema, stochastic, atr } = require('./indicators');

class TripleEMA extends BaseStrategy {
  constructor(params = {}) {
    super('Triple EMA', {
      fast: 9,
      mid: 21,
      slow: 55,
      stochK: 14,
      stochD: 3,
      stochOversold: 25,
      stochOverbought: 75,
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { fast, mid, slow, stochK, stochD, stochOversold, stochOverbought } = this.params;

    const emaFast = ema(closes, fast);
    const emaMid = ema(closes, mid);
    const emaSlow = ema(closes, slow);
    const stoch = stochastic(candles, stochK, stochD);
    const atrValues = atr(candles, 14);

    if (emaSlow.length < 2 || stoch.k.length < 2 || stoch.d.length < 2) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    // EMA 정렬 확인
    const fOff = emaFast.length - emaSlow.length;
    const mOff = emaMid.length - emaSlow.length;
    const currF = emaFast[emaFast.length - 1];
    const currM = emaMid[emaMid.length - 1];
    const currS = emaSlow[emaSlow.length - 1];
    const prevF = emaFast[emaFast.length - 2];
    const prevM = emaMid[emaMid.length - 2];
    const prevS = emaSlow[emaSlow.length - 2];

    const bullishAlign = currF > currM && currM > currS; // 상승 정렬
    const bearishAlign = currF < currM && currM < currS; // 하락 정렬
    const prevBullish = prevF > prevM && prevM > prevS;
    const prevBearish = prevF < prevM && prevM < prevS;

    // 스토캐스틱
    const currK = stoch.k[stoch.k.length - 1];
    const prevK = stoch.k[stoch.k.length - 2];
    const currD = stoch.d[stoch.d.length - 1];
    const prevD = stoch.d.length >= 2 ? stoch.d[stoch.d.length - 2] : currD;

    // 스토캐스틱 크로스
    const stochBullCross = prevK <= prevD && currK > currD;
    const stochBearCross = prevK >= prevD && currK < currD;

    const currPrice = closes[closes.length - 1];

    // 매수 1: 상승 정렬 진입 시점 + 스토캐스틱 과매도 반등
    if (bullishAlign && !prevBullish) {
      const strength = 0.75;
      return { action: 'buy', reason: `EMA 상승정렬 진입 (${fast}/${mid}/${slow})`, strength };
    }

    // 매수 2: 이미 상승 정렬 + 스토캐스틱 과매도에서 크로스 (눌림목)
    if (bullishAlign && currK < stochOversold + 10 && stochBullCross) {
      return { action: 'buy', reason: `EMA 상승+스토캐스틱 반등 (K:${currK.toFixed(0)})`, strength: 0.8 };
    }

    // 매수 3: Fast EMA가 Mid를 상향 돌파 + Slow 위에 있음
    if (prevF <= prevM && currF > currM && currF > currS) {
      return { action: 'buy', reason: `EMA${fast}이 EMA${mid} 골든크로스`, strength: 0.65 };
    }

    // 매도 1: 하락 정렬 진입 시점
    if (bearishAlign && !prevBearish) {
      return { action: 'sell', reason: `EMA 하락정렬 전환 (${fast}/${mid}/${slow})`, strength: 0.75 };
    }

    // 매도 2: 이미 하락 정렬 + 스토캐스틱 과매수에서 크로스
    if (bearishAlign && currK > stochOverbought - 10 && stochBearCross) {
      return { action: 'sell', reason: `EMA 하락+스토캐스틱 반락 (K:${currK.toFixed(0)})`, strength: 0.8 };
    }

    // 매도 3: Fast EMA가 Mid를 하향 돌파 + Slow 아래
    if (prevF >= prevM && currF < currM && currF < currS) {
      return { action: 'sell', reason: `EMA${fast}이 EMA${mid} 데드크로스`, strength: 0.65 };
    }

    const align = bullishAlign ? '상승정렬' : bearishAlign ? '하락정렬' : '비정렬';
    return { action: 'hold', reason: `EMA ${align} (K:${currK.toFixed(0)})`, strength: 0 };
  }
}

module.exports = TripleEMA;
