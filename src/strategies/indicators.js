/**
 * 기술적 분석 지표 계산 유틸리티
 */

/**
 * 단순 이동평균 (SMA)
 */
function sma(values, period) {
  if (values.length < period) return [];
  const result = [];
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

/**
 * 지수 이동평균 (EMA)
 */
function ema(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  // 첫 번째 EMA는 SMA로 초기화
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

/**
 * RSI (Relative Strength Index)
 */
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return [];

  const gains = [];
  const losses = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }

  const result = [];
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i <= gains.length; i++) {
    if (i === period) {
      // 첫 RSI
    } else {
      avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

/**
 * 볼린저 밴드
 */
function bollingerBands(closes, period = 20, multiplier = 2) {
  if (closes.length < period) return { upper: [], middle: [], lower: [] };

  const upper = [];
  const middle = [];
  const lower = [];

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);

    middle.push(mean);
    upper.push(mean + multiplier * std);
    lower.push(mean - multiplier * std);
  }

  return { upper, middle, lower };
}

module.exports = { sma, ema, rsi, bollingerBands, macd, atr, stochastic, adx };

/**
 * MACD (Moving Average Convergence Divergence)
 * @returns {{ macdLine: number[], signalLine: number[], histogram: number[] }}
 */
function macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = ema(closes, fastPeriod);
  const slowEMA = ema(closes, slowPeriod);

  if (!fastEMA.length || !slowEMA.length) return { macdLine: [], signalLine: [], histogram: [] };

  // 길이를 slowEMA에 맞추기
  const offset = fastEMA.length - slowEMA.length;
  const macdLine = [];
  for (let i = 0; i < slowEMA.length; i++) {
    macdLine.push(fastEMA[i + offset] - slowEMA[i]);
  }

  const signalLine = ema(macdLine, signalPeriod);
  const sigOffset = macdLine.length - signalLine.length;
  const histogram = [];
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + sigOffset] - signalLine[i]);
  }

  return { macdLine, signalLine, histogram };
}

/**
 * ATR (Average True Range) — 변동성 측정
 */
function atr(candles, period = 14) {
  if (candles.length < period + 1) return [];

  const trValues = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    trValues.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  const result = [];
  let avg = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(avg);
  for (let i = period; i < trValues.length; i++) {
    avg = (avg * (period - 1) + trValues[i]) / period;
    result.push(avg);
  }
  return result;
}

/**
 * 스토캐스틱 오실레이터 (%K, %D)
 */
function stochastic(candles, kPeriod = 14, dPeriod = 3) {
  if (candles.length < kPeriod) return { k: [], d: [] };

  const kValues = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...slice.map((c) => c.high));
    const low = Math.min(...slice.map((c) => c.low));
    const k = high === low ? 50 : ((candles[i].close - low) / (high - low)) * 100;
    kValues.push(k);
  }

  const dValues = sma(kValues, dPeriod);

  return { k: kValues, d: dValues };
}

/**
 * ADX (Average Directional Index) — 추세 강도 측정
 * @param {Array} candles - OHLCV 캔들 배열
 * @param {number} period - 기간 (기본 14)
 * @returns {{ adx: number[], plusDI: number[], minusDI: number[] }}
 */
function adx(candles, period = 14) {
  if (candles.length < period * 2 + 1) return { adx: [], plusDI: [], minusDI: [] };

  const plusDM = [];
  const minusDM = [];
  const trValues = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trValues.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  // Wilder's smoothing
  const smooth = (arr, p) => {
    const result = [];
    let sum = arr.slice(0, p).reduce((a, b) => a + b, 0);
    result.push(sum);
    for (let i = p; i < arr.length; i++) {
      sum = sum - sum / p + arr[i];
      result.push(sum);
    }
    return result;
  };

  const smoothTR = smooth(trValues, period);
  const smoothPlusDM = smooth(plusDM, period);
  const smoothMinusDM = smooth(minusDM, period);

  const plusDI = [];
  const minusDI = [];
  const dx = [];

  for (let i = 0; i < smoothTR.length; i++) {
    const pdi = smoothTR[i] > 0 ? (smoothPlusDM[i] / smoothTR[i]) * 100 : 0;
    const mdi = smoothTR[i] > 0 ? (smoothMinusDM[i] / smoothTR[i]) * 100 : 0;
    plusDI.push(pdi);
    minusDI.push(mdi);
    const diSum = pdi + mdi;
    dx.push(diSum > 0 ? (Math.abs(pdi - mdi) / diSum) * 100 : 0);
  }

  // ADX = smoothed DX
  const adxValues = [];
  if (dx.length >= period) {
    let adxSum = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    adxValues.push(adxSum);
    for (let i = period; i < dx.length; i++) {
      adxSum = (adxSum * (period - 1) + dx[i]) / period;
      adxValues.push(adxSum);
    }
  }

  return { adx: adxValues, plusDI, minusDI };
}
