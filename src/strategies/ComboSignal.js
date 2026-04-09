/**
 * 복합 시그널 전략 (v3)
 * - RSI + MACD + %B + 추세 + 거래량 모멘텀 종합 점수
 * - 더 세밀한 채점 + 높은 강도 출력
 * - 비대칭 임계점 (매수/매도 다르게)
 */

const BaseStrategy = require('./BaseStrategy');
const { ema, rsi, macd, bollingerBands, atr } = require('./indicators');

class ComboSignal extends BaseStrategy {
  constructor(params = {}) {
    super('Combo Signal', {
      buyThreshold: 0.12,
      sellThreshold: -0.12,
      rsiPeriod: 14,
      macdFast: 12,
      macdSlow: 26,
      macdSignal: 9,
      bbPeriod: 20,
      trendPeriod: 50,
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { buyThreshold, sellThreshold, rsiPeriod, macdFast, macdSlow, macdSignal, bbPeriod, trendPeriod } =
      this.params;

    const rsiValues = rsi(closes, rsiPeriod);
    const m = macd(closes, macdFast, macdSlow, macdSignal);
    const bb = bollingerBands(closes, bbPeriod, 2);
    const trend = ema(closes, trendPeriod);
    const atrValues = atr(candles, 14);

    if (rsiValues.length < 3 || m.histogram.length < 3 || bb.upper.length < 2 || trend.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const currPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 2];

    // 1. RSI 점수 (-1 ~ +1) — 더 넓은 범위
    const currRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];
    let rsiScore = 0;
    if (currRSI < 25) rsiScore = 1.0;
    else if (currRSI < 35) rsiScore = 0.7;
    else if (currRSI < 45 && currRSI > prevRSI) rsiScore = 0.3;
    else if (currRSI > 75) rsiScore = -1.0;
    else if (currRSI > 65) rsiScore = -0.7;
    else if (currRSI > 55 && currRSI < prevRSI) rsiScore = -0.3;

    // 2. MACD 점수 (-1 ~ +1)
    const hLen = m.histogram.length;
    const currHist = m.histogram[hLen - 1];
    const prevHist = m.histogram[hLen - 2];
    const prev2Hist = m.histogram[hLen - 3];
    let macdScore = 0;
    if (currHist > 0 && currHist > prevHist) macdScore = 1.0;
    else if (currHist > 0 && currHist < prevHist) macdScore = 0.2;
    else if (currHist < 0 && currHist > prevHist)
      macdScore = 0.5; // 반전 조짐 강화
    else if (currHist < 0 && currHist < prevHist) macdScore = -1.0;
    // 연속 3봉 방향 전환 보너스
    if (prev2Hist < prevHist && prevHist < currHist) macdScore = Math.min(macdScore + 0.3, 1);
    if (prev2Hist > prevHist && prevHist > currHist) macdScore = Math.max(macdScore - 0.3, -1);

    // 3. 볼린저 %B 점수 (-1 ~ +1)
    const bbLen = bb.upper.length;
    const percentB =
      bb.upper[bbLen - 1] === bb.lower[bbLen - 1]
        ? 0.5
        : (currPrice - bb.lower[bbLen - 1]) / (bb.upper[bbLen - 1] - bb.lower[bbLen - 1]);
    let bbScore = 0;
    if (percentB < 0.0) bbScore = 1.0;
    else if (percentB < 0.15) bbScore = 0.8;
    else if (percentB < 0.3) bbScore = 0.4;
    else if (percentB > 1.0) bbScore = -1.0;
    else if (percentB > 0.85) bbScore = -0.8;
    else if (percentB > 0.7) bbScore = -0.4;

    // 4. 추세 점수 (-1 ~ +1)
    const currTrend = trend[trend.length - 1];
    const prevTrend = trend[trend.length - 2];
    const prev2Trend = trend[trend.length - 3];
    const trendAccel = currTrend - prevTrend - (prevTrend - prev2Trend);
    const priceVsTrend = (currPrice - currTrend) / currTrend;
    let trendScore = 0;
    if (priceVsTrend > 0.03) trendScore = 0.9;
    else if (priceVsTrend > 0.01) trendScore = 0.5;
    else if (priceVsTrend > 0) trendScore = 0.2;
    else if (priceVsTrend < -0.03) trendScore = -0.9;
    else if (priceVsTrend < -0.01) trendScore = -0.5;
    else trendScore = -0.2;
    // 추세 가속 보너스
    if (trendAccel > 0 && trendScore > 0) trendScore = Math.min(trendScore + 0.1, 1);
    if (trendAccel < 0 && trendScore < 0) trendScore = Math.max(trendScore - 0.1, -1);

    // 가중치 합산
    const weights = { rsi: 0.2, macd: 0.3, bb: 0.2, trend: 0.3 };
    const totalScore =
      rsiScore * weights.rsi + macdScore * weights.macd + bbScore * weights.bb + trendScore * weights.trend;

    const details = `점수:${totalScore.toFixed(2)} RSI:${currRSI.toFixed(0)} MACD:${currHist.toFixed(0)} %B:${percentB.toFixed(2)}`;

    if (totalScore >= buyThreshold) {
      const strength = Math.min(totalScore * 1.5 + 0.4, 1);
      return { action: 'buy', reason: `복합매수 (${details})`, strength };
    }

    if (totalScore <= sellThreshold) {
      const strength = Math.min(Math.abs(totalScore) * 1.5 + 0.4, 1);
      return { action: 'sell', reason: `복합매도 (${details})`, strength };
    }

    return { action: 'hold', reason: `복합중립 (${details})`, strength: 0 };
  }
}

module.exports = ComboSignal;
