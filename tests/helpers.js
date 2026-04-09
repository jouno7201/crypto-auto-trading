/**
 * 테스트 헬퍼: 합성 캔들 데이터 생성
 */

/**
 * 가격 시리즈로부터 OHLCV 캔들 배열 생성
 * @param {number[]} closes - 종가 배열
 * @param {object} opts - { noise: 변동 비율 (기본 0.005), baseVolume }
 */
function candlesFromCloses(closes, opts = {}) {
  const { noise = 0.005, baseVolume = 100 } = opts;
  return closes.map((close, i) => {
    const spread = close * noise;
    return {
      timestamp: `2026-01-01T${String(i).padStart(2, '0')}:00:00`,
      open: i > 0 ? closes[i - 1] : close,
      high: close + spread,
      low: close - spread,
      close,
      volume: baseVolume + Math.random() * baseVolume,
    };
  });
}

/**
 * 상승 추세 캔들 생성
 */
function risingCandles(count = 200, startPrice = 50000000, stepPercent = 0.002) {
  const closes = [];
  let p = startPrice;
  for (let i = 0; i < count; i++) {
    p *= 1 + stepPercent + (Math.random() - 0.4) * stepPercent;
    closes.push(p);
  }
  return candlesFromCloses(closes);
}

/**
 * 하락 추세 캔들 생성
 */
function fallingCandles(count = 200, startPrice = 50000000, stepPercent = 0.002) {
  const closes = [];
  let p = startPrice;
  for (let i = 0; i < count; i++) {
    p *= 1 - stepPercent - (Math.random() - 0.4) * stepPercent;
    closes.push(p);
  }
  return candlesFromCloses(closes);
}

/**
 * 골든크로스가 발생하는 캔들 세트
 * 하락 → 반등 → 단기EMA > 장기EMA
 */
function goldenCrossCandles(count = 200, startPrice = 50000000) {
  const closes = [];
  let p = startPrice;
  // 전반: 하락/횡보 (단기 < 장기)
  const half = Math.floor(count * 0.6);
  for (let i = 0; i < half; i++) {
    p *= 1 - 0.001 + Math.random() * 0.001;
    closes.push(p);
  }
  // 후반: 강한 상승 (단기 > 장기 크로스)
  for (let i = half; i < count; i++) {
    p *= 1 + 0.005 + Math.random() * 0.003;
    closes.push(p);
  }
  return candlesFromCloses(closes);
}

/**
 * 데드크로스가 발생하는 캔들 세트
 */
function deadCrossCandles(count = 200, startPrice = 50000000) {
  const closes = [];
  let p = startPrice;
  const half = Math.floor(count * 0.6);
  for (let i = 0; i < half; i++) {
    p *= 1 + 0.001 + Math.random() * 0.001;
    closes.push(p);
  }
  for (let i = half; i < count; i++) {
    p *= 1 - 0.005 - Math.random() * 0.003;
    closes.push(p);
  }
  return candlesFromCloses(closes);
}

module.exports = {
  candlesFromCloses,
  risingCandles,
  fallingCandles,
  goldenCrossCandles,
  deadCrossCandles,
};
