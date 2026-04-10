/**
 * 시장 상태 감지기 v2
 * - ADX 기반 추세/횡보 판별 + 퍼지 신뢰도
 * - ADX 속도(가속/감속) 감지 → 조기 상태 전환
 * - +DI / -DI 방향 + 크기 비율로 추세 품질 평가
 * - ATR% 기반 변동성 폭발 감지 (volatile)
 * - 횡보장 S/R 레인지 경계 자동 추출
 * - 추세 강도 점수 (trendScore 0~1)
 *
 * 상태: 'trending-up' | 'trending-down' | 'ranging' | 'volatile'
 */

const { adx, atr, ema, sma, bollingerBands } = require('./indicators');

/**
 * 시장 상태 감지
 * @param {Array} candles - OHLCV 캔들 배열 (최소 50개)
 * @param {Object} opts
 * @returns {{ state, adx, adxPrev, adxSlope, plusDI, minusDI, diRatio,
 *             atr, atrPercent, trendScore, stateConfidence, volatilityRatio,
 *             rangeBound, details }}
 */
function detectMarketState(candles, opts = {}) {
  const {
    adxPeriod = 14,
    adxTrendThreshold = 25,
    adxStrongThreshold = 40,
    atrPeriod = 14,
    volatilityLookback = 20,
    volatilityMultiplier = 1.8,
    adxSlopeBars = 5, // ADX 속도 계산에 사용할 봉 수
    rangeLookback = 30, // S/R 레인지 경계 탐색 기간
  } = opts;

  const unknown = {
    state: 'unknown',
    adx: 0,
    adxPrev: 0,
    adxSlope: 'flat',
    plusDI: 0,
    minusDI: 0,
    diRatio: 0,
    atr: 0,
    atrPercent: 0,
    trendScore: 0,
    stateConfidence: 0,
    volatilityRatio: 1,
    rangeBound: null,
    details: '데이터 부족',
  };

  if (candles.length < adxPeriod * 3) return unknown;

  const adxResult = adx(candles, adxPeriod);
  const atrValues = atr(candles, atrPeriod);

  if (!adxResult.adx.length || !atrValues.length) {
    return { ...unknown, details: 'ADX/ATR 계산 불가' };
  }

  const currADX = adxResult.adx[adxResult.adx.length - 1];
  const currPlusDI = adxResult.plusDI[adxResult.plusDI.length - 1];
  const currMinusDI = adxResult.minusDI[adxResult.minusDI.length - 1];
  const currATR = atrValues[atrValues.length - 1];
  const currPrice = candles[candles.length - 1].close;
  const atrPercent = currPrice > 0 ? (currATR / currPrice) * 100 : 0;

  // --- ADX 속도 (rising/falling/flat) ---
  const prevADXIdx = Math.max(0, adxResult.adx.length - 1 - adxSlopeBars);
  const prevADX = adxResult.adx[prevADXIdx];
  const adxDelta = currADX - prevADX;
  const adxSlope = adxDelta > 2 ? 'rising' : adxDelta < -2 ? 'falling' : 'flat';

  // --- DI 비율 (방향 품질) ---
  const diSum = currPlusDI + currMinusDI;
  const diRatio = diSum > 0 ? Math.abs(currPlusDI - currMinusDI) / diSum : 0;

  // --- 변동성 비율: 현재 ATR% / 최근 평균 ATR% ---
  const recentATRs = atrValues.slice(-volatilityLookback);
  const closes = candles.slice(-volatilityLookback).map((c) => c.close);
  let avgAtrPercent = 0;
  if (recentATRs.length >= 5 && closes.length >= 5) {
    const pcts = recentATRs.map((a, i) => (closes[i] > 0 ? (a / closes[i]) * 100 : 0));
    avgAtrPercent = pcts.reduce((s, v) => s + v, 0) / pcts.length;
  }
  const volatilityRatio = avgAtrPercent > 0 ? atrPercent / avgAtrPercent : 1;

  // --- 추세 강도 점수 (0~1) — ADX 속도 반영 ---
  const diSpread = Math.abs(currPlusDI - currMinusDI);
  let trendScore = Math.min(1, (currADX / 50) * 0.5 + (diSpread / 40) * 0.3 + diRatio * 0.2);
  // ADX 상승 시 추세 점수 부스트, 하락 시 감쇠
  if (adxSlope === 'rising') trendScore = Math.min(1, trendScore + 0.1);
  else if (adxSlope === 'falling') trendScore = Math.max(0, trendScore - 0.1);

  // --- 퍼지 상태 판별 + 신뢰도 ---
  let state, stateConfidence, details;

  // 1) 변동성 폭발 (ADX 낮은데 ATR% 급등 = 방향 없는 급변동)
  if (volatilityRatio >= volatilityMultiplier && currADX < adxTrendThreshold) {
    state = 'volatile';
    stateConfidence = Math.min(1, (volatilityRatio - 1) / 2);
    details = `변동성 폭발 (ATR%:${atrPercent.toFixed(2)}, 평균대비:${volatilityRatio.toFixed(1)}x, ADX:${currADX.toFixed(1)})`;
  }
  // 2) 추세장 — 퍼지 경계: ADX 20~30 구간은 낮은 신뢰도
  else if (currADX >= adxTrendThreshold || (currADX >= 20 && adxSlope === 'rising' && diRatio > 0.3)) {
    // ADX 20-25 + rising → 조기 추세 감지 (낮은 신뢰도)
    const earlyTrend = currADX < adxTrendThreshold;
    if (currPlusDI > currMinusDI) {
      state = 'trending-up';
    } else {
      state = 'trending-down';
    }

    // 신뢰도: ADX 값 + 속도 + DI 비율 기반 연속값
    if (currADX >= adxStrongThreshold) {
      stateConfidence = Math.min(1, 0.8 + diRatio * 0.2);
    } else if (earlyTrend) {
      stateConfidence = Math.min(0.6, 0.3 + diRatio * 0.3);
    } else {
      // ADX 25~40 구간: 선형 보간
      stateConfidence = Math.min(
        1,
        0.5 + ((currADX - adxTrendThreshold) / (adxStrongThreshold - adxTrendThreshold)) * 0.3 + diRatio * 0.2,
      );
    }
    // ADX 하락 중이면 신뢰도 감소 (추세 약화)
    if (adxSlope === 'falling') stateConfidence = Math.max(0.2, stateConfidence - 0.2);

    const strong = currADX >= adxStrongThreshold ? '강한 ' : earlyTrend ? '초기 ' : '';
    const dir = state === 'trending-up' ? '상승' : '하락';
    details = `${strong}${dir}추세 (ADX:${currADX.toFixed(1)}${adxSlope === 'rising' ? '↑' : adxSlope === 'falling' ? '↓' : ''}, +DI:${currPlusDI.toFixed(1)}, -DI:${currMinusDI.toFixed(1)}, 신뢰도:${stateConfidence.toFixed(2)})`;
  }
  // 3) 횡보
  else {
    state = 'ranging';
    // 횡보 신뢰도: ADX 낮을수록 확실한 횡보
    stateConfidence = Math.min(1, (1 - currADX / adxTrendThreshold) * 0.6 + (1 - trendScore) * 0.4);
    if (adxSlope === 'falling') stateConfidence = Math.min(1, stateConfidence + 0.1); // ADX 하락 = 횡보 강화
    details = `횡보/비추세 (ADX:${currADX.toFixed(1)}${adxSlope === 'falling' ? '↓' : ''}, ATR%:${atrPercent.toFixed(2)}, 신뢰도:${stateConfidence.toFixed(2)})`;
  }

  // --- 횡보장 S/R 레인지 경계 ---
  let rangeBound = null;
  if (state === 'ranging' || (state !== 'volatile' && stateConfidence < 0.5)) {
    const lookback = candles.slice(-rangeLookback);
    if (lookback.length >= 10) {
      const highs = lookback.map((c) => c.high);
      const lows = lookback.map((c) => c.low);
      // 상/하위 10% 제거 후 경계 추출 (이상치 제거)
      const sortedHighs = [...highs].sort((a, b) => a - b);
      const sortedLows = [...lows].sort((a, b) => a - b);
      const trim = Math.max(1, Math.floor(lookback.length * 0.1));
      const upper = sortedHighs.slice(-trim).reduce((a, b) => a + b, 0) / trim;
      const lower = sortedLows.slice(0, trim).reduce((a, b) => a + b, 0) / trim;
      const mid = (upper + lower) / 2;
      const rangeWidth = currPrice > 0 ? ((upper - lower) / currPrice) * 100 : 0;
      rangeBound = {
        upper: parseFloat(upper.toFixed(2)),
        lower: parseFloat(lower.toFixed(2)),
        mid: parseFloat(mid.toFixed(2)),
        widthPercent: parseFloat(rangeWidth.toFixed(2)),
      };
    }
  }

  return {
    state,
    adx: parseFloat(currADX.toFixed(2)),
    adxPrev: parseFloat(prevADX.toFixed(2)),
    adxSlope,
    plusDI: parseFloat(currPlusDI.toFixed(2)),
    minusDI: parseFloat(currMinusDI.toFixed(2)),
    diRatio: parseFloat(diRatio.toFixed(3)),
    atr: parseFloat(currATR.toFixed(2)),
    atrPercent: parseFloat(atrPercent.toFixed(3)),
    trendScore: parseFloat(trendScore.toFixed(3)),
    stateConfidence: parseFloat(stateConfidence.toFixed(3)),
    volatilityRatio: parseFloat(volatilityRatio.toFixed(2)),
    rangeBound,
    details,
  };
}

module.exports = { detectMarketState };
