/**
 * 트리플 EMA 모멘텀 전략 (v3)
 * - 3 EMA (9/21/55) 정렬 + 스토캐스틱 타이밍
 * - 부분 정렬 진입 (2 EMA 정렬 시에도 진입)
 * - 스토캐스틱 크로스 + 다이버전스
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

    if (emaSlow.length < 3 || stoch.k.length < 3 || stoch.d.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const currF = emaFast[emaFast.length - 1];
    const currM = emaMid[emaMid.length - 1];
    const currS = emaSlow[emaSlow.length - 1];
    const prevF = emaFast[emaFast.length - 2];
    const prevM = emaMid[emaMid.length - 2];
    const prevS = emaSlow[emaSlow.length - 2];

    const bullishAlign = currF > currM && currM > currS;
    const bearishAlign = currF < currM && currM < currS;
    const prevBullish = prevF > prevM && prevM > prevS;
    const prevBearish = prevF < prevM && prevM < prevS;

    // 부분 정렬
    const partialBullish = currF > currM && currF > currS; // fast가 둘 다 위
    const partialBearish = currF < currM && currF < currS; // fast가 둘 다 아래

    const currK = stoch.k[stoch.k.length - 1];
    const prevK = stoch.k[stoch.k.length - 2];
    const currD = stoch.d[stoch.d.length - 1];
    const prevD = stoch.d[stoch.d.length - 2];

    const stochBullCross = prevK <= prevD && currK > currD;
    const stochBearCross = prevK >= prevD && currK < currD;

    const currPrice = closes[closes.length - 1];

    // ========== 매수 ==========

    // 1) 완전 상승 정렬 진입 시점
    if (bullishAlign && !prevBullish) {
      return { action: 'buy', reason: `EMA 상승정렬 진입 (${fast}/${mid}/${slow})`, strength: 0.8 };
    }

    // 2) 상승 정렬 + 스토캐스틱 과매도 반등 (눌림목)
    if (bullishAlign && currK < stochOversold + 15 && stochBullCross) {
      return { action: 'buy', reason: `EMA 상승+스토캐스틱 반등 (K:${currK.toFixed(0)})`, strength: 0.85 };
    }

    // 3) 부분 상승 정렬 + 스토캐스틱 과매도 크로스
    if (partialBullish && !bullishAlign && currK < stochOversold + 10 && stochBullCross) {
      return { action: 'buy', reason: `부분정렬 + 스토캐스틱 반등 (K:${currK.toFixed(0)})`, strength: 0.7 };
    }

    // 4) Fast EMA가 Mid 상향 돌파 + Slow 위
    if (prevF <= prevM && currF > currM && currF > currS) {
      return { action: 'buy', reason: `EMA${fast} 골든크로스 EMA${mid}`, strength: 0.7 };
    }

    // ========== 매도 ==========

    // 5) 완전 하락 정렬 진입 시점
    if (bearishAlign && !prevBearish) {
      return { action: 'sell', reason: `EMA 하락정렬 전환 (${fast}/${mid}/${slow})`, strength: 0.8 };
    }

    // 6) 하락 정렬 + 스토캐스틱 과매수 반락
    if (bearishAlign && currK > stochOverbought - 15 && stochBearCross) {
      return { action: 'sell', reason: `EMA 하락+스토캐스틱 반락 (K:${currK.toFixed(0)})`, strength: 0.85 };
    }

    // 7) 부분 하락 정렬 + 스토캐스틱 과매수 크로스
    if (partialBearish && !bearishAlign && currK > stochOverbought - 10 && stochBearCross) {
      return { action: 'sell', reason: `부분정렬 + 스토캐스틱 반락 (K:${currK.toFixed(0)})`, strength: 0.7 };
    }

    // 8) Fast EMA가 Mid 하향 돌파 + Slow 아래
    if (prevF >= prevM && currF < currM && currF < currS) {
      return { action: 'sell', reason: `EMA${fast} 데드크로스 EMA${mid}`, strength: 0.7 };
    }

    const align = bullishAlign ? '상승정렬' : bearishAlign ? '하락정렬' : '비정렬';
    return { action: 'hold', reason: `EMA ${align} (K:${currK.toFixed(0)})`, strength: 0 };
  }
}

module.exports = TripleEMA;
