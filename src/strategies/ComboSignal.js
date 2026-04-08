/**
 * 복합 시그널 전략 (Multi-Signal Combo)
 * - RSI + MACD + 볼린저 %B + EMA 추세를 종합 점수화
 * - 각 지표에 가중치를 부여하여 합산
 * - 임계점 이상/이하에서 매수/매도
 * - 단일 지표보다 안정적이고 오시그널 감소
 */

const BaseStrategy = require('./BaseStrategy');
const { ema, rsi, macd, bollingerBands, atr } = require('./indicators');

class ComboSignal extends BaseStrategy {
  constructor(params = {}) {
    super('Combo Signal', {
      buyThreshold: 0.3,
      sellThreshold: -0.3,
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

    if (rsiValues.length < 2 || m.histogram.length < 2 || bb.upper.length < 2 || trend.length < 2) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    const currPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 2];

    // 1. RSI 점수 (-1 ~ +1)
    const currRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];
    let rsiScore = 0;
    if (currRSI < 30) rsiScore = 1.0;
    else if (currRSI < 40 && currRSI > prevRSI) rsiScore = 0.5;
    else if (currRSI > 70) rsiScore = -1.0;
    else if (currRSI > 60 && currRSI < prevRSI) rsiScore = -0.5;

    // 2. MACD 점수 (-1 ~ +1)
    const hLen = m.histogram.length;
    const currHist = m.histogram[hLen - 1];
    const prevHist = m.histogram[hLen - 2];
    let macdScore = 0;
    if (currHist > 0 && currHist > prevHist)
      macdScore = 1.0; // 양수 & 증가 = 강한 상승
    else if (currHist > 0 && currHist < prevHist)
      macdScore = 0.3; // 양수 & 감소 = 약한 상승
    else if (currHist < 0 && currHist > prevHist)
      macdScore = 0.3; // 음수 & 증가 = 반전 조짐
    else if (currHist < 0 && currHist < prevHist) macdScore = -1.0; // 음수 & 감소 = 강한 하락

    // 3. 볼린저 %B 점수 (-1 ~ +1)
    const bbLen = bb.upper.length;
    const percentB =
      bb.upper[bbLen - 1] === bb.lower[bbLen - 1]
        ? 0.5
        : (currPrice - bb.lower[bbLen - 1]) / (bb.upper[bbLen - 1] - bb.lower[bbLen - 1]);
    let bbScore = 0;
    if (percentB < 0.0)
      bbScore = 1.0; // 하단 이탈
    else if (percentB < 0.2)
      bbScore = 0.7; // 하단 근처
    else if (percentB > 1.0)
      bbScore = -1.0; // 상단 이탈
    else if (percentB > 0.8) bbScore = -0.7; // 상단 근처

    // 4. 추세 점수 (-1 ~ +1)
    const currTrend = trend[trend.length - 1];
    const prevTrend = trend[trend.length - 2];
    const trendDirection = currTrend > prevTrend ? 1 : -1;
    const priceVsTrend = (currPrice - currTrend) / currTrend;
    let trendScore = 0;
    if (priceVsTrend > 0.02) trendScore = 0.8 * trendDirection;
    else if (priceVsTrend > 0) trendScore = 0.4 * trendDirection;
    else if (priceVsTrend < -0.02) trendScore = -0.8;
    else trendScore = -0.3;

    // 가중치 합산 (총합 범위: -1 ~ +1)
    const weights = { rsi: 0.25, macd: 0.3, bb: 0.2, trend: 0.25 };
    const totalScore =
      rsiScore * weights.rsi + macdScore * weights.macd + bbScore * weights.bb + trendScore * weights.trend;

    const details = `점수:${totalScore.toFixed(2)} RSI:${currRSI.toFixed(0)} MACD:${currHist.toFixed(0)} %B:${percentB.toFixed(2)}`;

    if (totalScore >= buyThreshold) {
      return { action: 'buy', reason: `복합매수 (${details})`, strength: Math.min(totalScore, 1) };
    }

    if (totalScore <= sellThreshold) {
      return { action: 'sell', reason: `복합매도 (${details})`, strength: Math.min(Math.abs(totalScore), 1) };
    }

    return { action: 'hold', reason: `복합중립 (${details})`, strength: 0 };
  }
}

module.exports = ComboSignal;
