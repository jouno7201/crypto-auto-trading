/**
 * 시장 상태 감지기
 * - ADX 기반 추세/횡보 판별
 * - +DI / -DI 방향으로 상승/하락 판별
 * - ATR% 기반 변동성 폭발 감지 (volatile)
 * - 추세 강도 점수 (trendScore 0~1)
 *
 * 상태: 'trending-up' | 'trending-down' | 'ranging' | 'volatile'
 */

const { adx, atr, ema, bollingerBands } = require('./indicators');

/**
 * 시장 상태 감지
 * @param {Array} candles - OHLCV 캔들 배열 (최소 50개)
 * @param {Object} opts
 * @returns {{ state, adx, plusDI, minusDI, atr, atrPercent, trendScore, volatilityRatio, details }}
 */
function detectMarketState(candles, opts = {}) {
  const {
    adxPeriod = 14,
    adxTrendThreshold = 25,
    adxStrongThreshold = 40,
    atrPeriod = 14,
    volatilityLookback = 20,   // ATR% 평균을 구할 기간
    volatilityMultiplier = 1.8, // 평균 ATR% × 1.8 이상이면 volatile
  } = opts;

  const unknown = { state: 'unknown', adx: 0, plusDI: 0, minusDI: 0, atr: 0, atrPercent: 0, trendScore: 0, volatilityRatio: 1, details: '데이터 부족' };

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

  // --- 변동성 비율: 현재 ATR% / 최근 평균 ATR% ---
  const recentATRs = atrValues.slice(-volatilityLookback);
  const closes = candles.slice(-volatilityLookback).map(c => c.close);
  let avgAtrPercent = 0;
  if (recentATRs.length >= 5 && closes.length >= 5) {
    const pcts = recentATRs.map((a, i) => closes[i] > 0 ? (a / closes[i]) * 100 : 0);
    avgAtrPercent = pcts.reduce((s, v) => s + v, 0) / pcts.length;
  }
  const volatilityRatio = avgAtrPercent > 0 ? atrPercent / avgAtrPercent : 1;

  // --- 추세 강도 점수 (0~1) ---
  const diSpread = Math.abs(currPlusDI - currMinusDI);
  const trendScore = Math.min(1, (currADX / 50) * 0.6 + (diSpread / 40) * 0.4);

  // --- 상태 판별 ---
  let state, details;

  // 1) 변동성 폭발 (ADX 낮은데 ATR% 급등 = 방향 없는 급변동)
  if (volatilityRatio >= volatilityMultiplier && currADX < adxTrendThreshold) {
    state = 'volatile';
    details = `변동성 폭발 (ATR%:${atrPercent.toFixed(2)}, 평균대비:${volatilityRatio.toFixed(1)}x, ADX:${currADX.toFixed(1)})`;
  }
  // 2) 추세장
  else if (currADX >= adxTrendThreshold) {
    if (currPlusDI > currMinusDI) {
      state = 'trending-up';
      const strong = currADX >= adxStrongThreshold ? '강한 ' : '';
      details = `${strong}상승추세 (ADX:${currADX.toFixed(1)}, +DI:${currPlusDI.toFixed(1)}, -DI:${currMinusDI.toFixed(1)}, score:${trendScore.toFixed(2)})`;
    } else {
      state = 'trending-down';
      const strong = currADX >= adxStrongThreshold ? '강한 ' : '';
      details = `${strong}하락추세 (ADX:${currADX.toFixed(1)}, +DI:${currPlusDI.toFixed(1)}, -DI:${currMinusDI.toFixed(1)}, score:${trendScore.toFixed(2)})`;
    }
  }
  // 3) 횡보
  else {
    state = 'ranging';
    details = `횡보/비추세 (ADX:${currADX.toFixed(1)}, ATR%:${atrPercent.toFixed(2)}, score:${trendScore.toFixed(2)})`;
  }

  return {
    state,
    adx: parseFloat(currADX.toFixed(2)),
    plusDI: parseFloat(currPlusDI.toFixed(2)),
    minusDI: parseFloat(currMinusDI.toFixed(2)),
    atr: parseFloat(currATR.toFixed(2)),
    atrPercent: parseFloat(atrPercent.toFixed(3)),
    trendScore: parseFloat(trendScore.toFixed(3)),
    volatilityRatio: parseFloat(volatilityRatio.toFixed(2)),
    details,
  };
}

module.exports = { detectMarketState };
