/**
 * 시장 상태 감지기
 * - ADX 기반 추세/횡보 판별
 * - +DI / -DI 방향으로 상승/하락 판별
 * - 변동성(ATR) 수준 판단
 *
 * 상태: 'trending-up' | 'trending-down' | 'ranging' | 'volatile'
 */

const { adx, atr, ema } = require('./indicators');

/**
 * 시장 상태 감지
 * @param {Array} candles - OHLCV 캔들 배열 (최소 50개)
 * @param {Object} opts
 * @returns {{ state: string, adx: number, plusDI: number, minusDI: number, atr: number, details: string }}
 */
function detectMarketState(candles, opts = {}) {
  const {
    adxPeriod = 14,
    adxTrendThreshold = 25, // ADX > 25 이면 추세장
    adxStrongThreshold = 40, // ADX > 40 이면 강한 추세
    atrPeriod = 14,
  } = opts;

  if (candles.length < adxPeriod * 3) {
    return { state: 'unknown', adx: 0, plusDI: 0, minusDI: 0, atr: 0, details: '데이터 부족' };
  }

  const adxResult = adx(candles, adxPeriod);
  const atrValues = atr(candles, atrPeriod);

  if (!adxResult.adx.length) {
    return { state: 'unknown', adx: 0, plusDI: 0, minusDI: 0, atr: 0, details: 'ADX 계산 불가' };
  }

  const currADX = adxResult.adx[adxResult.adx.length - 1];
  const currPlusDI = adxResult.plusDI[adxResult.plusDI.length - 1];
  const currMinusDI = adxResult.minusDI[adxResult.minusDI.length - 1];
  const currATR = atrValues.length ? atrValues[atrValues.length - 1] : 0;
  const currPrice = candles[candles.length - 1].close;
  const atrPercent = currPrice > 0 ? (currATR / currPrice) * 100 : 0;

  let state, details;

  if (currADX >= adxTrendThreshold) {
    if (currPlusDI > currMinusDI) {
      state = 'trending-up';
      const strong = currADX >= adxStrongThreshold ? '강한 ' : '';
      details = `${strong}상승추세 (ADX:${currADX.toFixed(1)}, +DI:${currPlusDI.toFixed(1)}, -DI:${currMinusDI.toFixed(1)})`;
    } else {
      state = 'trending-down';
      const strong = currADX >= adxStrongThreshold ? '강한 ' : '';
      details = `${strong}하락추세 (ADX:${currADX.toFixed(1)}, +DI:${currPlusDI.toFixed(1)}, -DI:${currMinusDI.toFixed(1)})`;
    }
  } else {
    state = 'ranging';
    details = `횡보/비추세 (ADX:${currADX.toFixed(1)}, ATR%:${atrPercent.toFixed(2)})`;
  }

  return {
    state,
    adx: parseFloat(currADX.toFixed(2)),
    plusDI: parseFloat(currPlusDI.toFixed(2)),
    minusDI: parseFloat(currMinusDI.toFixed(2)),
    atr: parseFloat(currATR.toFixed(2)),
    atrPercent: parseFloat(atrPercent.toFixed(3)),
    details,
  };
}

module.exports = { detectMarketState };
