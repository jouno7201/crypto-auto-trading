/**
 * 평균 회귀 전략 v2 (Mean Reversion)
 * - 횡보장(ranging)에 최적화
 * - Keltner Channel + RSI + 가격-EMA 괴리율
 * - 밴드 터치 후 중심 회귀 매매
 * - v2: 시장 상태 필터, 동적 임계값, RSI 밴드 확장, 볼륨 확인
 */

const BaseStrategy = require('./BaseStrategy');
const { ema, rsi, atr, bollingerBands } = require('./indicators');
const { detectMarketState } = require('./marketDetector');

class MeanReversion extends BaseStrategy {
  constructor(params = {}) {
    super('Mean Reversion', {
      emaPeriod: 20,
      atrPeriod: 14,
      keltnerMult: 2.0, // v2: 1.5→2.0 (더 넓은 채널, 확실한 이탈만 포착)
      rsiPeriod: 14,
      deviationThreshold: 1.2, // v2: 1.5→1.2 (약간 더 민감)
      // v2 신규 파라미터
      trendFilterADX: 30, // ADX > 30 추세장에서 매매 억제
      volumeLookback: 10, // 볼륨 비교 기간
      ...params,
    });
  }

  analyze(candles) {
    const closes = candles.map((c) => c.close);
    const { emaPeriod, atrPeriod, keltnerMult, rsiPeriod, deviationThreshold, trendFilterADX } = this.params;

    const emaValues = ema(closes, emaPeriod);
    const atrValues = atr(candles, atrPeriod);
    const rsiValues = rsi(closes, rsiPeriod);
    const bb = bollingerBands(closes, 20, 2);

    if (emaValues.length < 5 || atrValues.length < 3 || rsiValues.length < 3 || bb.upper.length < 3) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    // v2: 시장 상태 확인 — 강한 추세장에서 역추세 매매 억제
    const market = detectMarketState(candles);
    const isTrending =
      (market.state === 'trending-up' || market.state === 'trending-down') && market.adx >= trendFilterADX;
    const isVolatile = market.state === 'volatile';

    // v2: 강한 추세장에서는 매매 억제 (역추세 매매 위험)
    if (isTrending && market.stateConfidence > 0.6) {
      return { action: 'hold', reason: `추세장 필터 (ADX:${market.adx}, ${market.state})`, strength: 0 };
    }

    const currPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 2];
    const currEMA = emaValues[emaValues.length - 1];
    const prevEMA = emaValues[emaValues.length - 2];
    const currATR = atrValues[atrValues.length - 1];
    const currRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];

    // Keltner Channel
    const upperKC = currEMA + currATR * keltnerMult;
    const lowerKC = currEMA - currATR * keltnerMult;
    const prevUpperKC = prevEMA + atrValues[atrValues.length - 2] * keltnerMult;
    const prevLowerKC = prevEMA - atrValues[atrValues.length - 2] * keltnerMult;

    // 가격-EMA 괴리율 (ATR 정규화)
    const deviation = currATR > 0 ? (currPrice - currEMA) / currATR : 0;
    const prevDeviation =
      atrValues[atrValues.length - 2] > 0 ? (prevPrice - prevEMA) / atrValues[atrValues.length - 2] : 0;

    // BB %B
    const bbLen = bb.upper.length;
    const percentB =
      bb.upper[bbLen - 1] - bb.lower[bbLen - 1] > 0
        ? (currPrice - bb.lower[bbLen - 1]) / (bb.upper[bbLen - 1] - bb.lower[bbLen - 1])
        : 0.5;

    // 회귀 방향 확인 (현재 가격이 EMA 쪽으로 움직이는지)
    const returningToMean = Math.abs(deviation) < Math.abs(prevDeviation);

    // v2: 동적 강도 보정 — 횡보 신뢰도 높을수록 시그널 부스트
    const rangeBoost = market.state === 'ranging' ? Math.min(0.15, market.stateConfidence * 0.15) : 0;

    // v2: 변동성장 시그널 감쇠
    const volDamp = isVolatile ? 0.7 : 1.0;

    // v2: 볼륨 확인 (candle에 volume 필드가 있을 경우)
    const hasVolume = candles[candles.length - 1].volume != null;
    let volumeConfirm = true;
    if (hasVolume && candles.length >= this.params.volumeLookback + 1) {
      const recentVols = candles.slice(-(this.params.volumeLookback + 1), -1).map((c) => c.volume);
      const avgVol = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
      const currVol = candles[candles.length - 1].volume;
      // 반전 시그널은 평균 이상 볼륨에서 더 신뢰 (0.7배 이상이면 OK)
      volumeConfirm = avgVol === 0 || currVol >= avgVol * 0.7;
    }

    // ========== 매수 (과매도 → 평균 회귀) ==========

    // 1) 하단 Keltner 이탈 후 진입 복귀 + RSI 과매도 반등
    //    v2: RSI 45→50 확장, 볼륨 확인
    if (prevPrice <= prevLowerKC && currPrice > lowerKC && currPrice > prevPrice) {
      if (currRSI < 50 && currRSI > prevRSI && volumeConfirm) {
        const depthBonus = Math.min(Math.abs(deviation) * 0.15, 0.2);
        const str = Math.min(1, (0.8 + depthBonus + rangeBoost) * volDamp);
        return {
          action: 'buy',
          reason: `KC 하단 복귀 (괴리:${deviation.toFixed(2)}ATR, ${market.state})`,
          strength: str,
        };
      }
    }

    // 2) 강한 하방 이탈 + 반등 시작
    //    v2: RSI 40→45 확장
    if (deviation < -deviationThreshold && returningToMean && currRSI > prevRSI) {
      if (currRSI < 45 && volumeConfirm) {
        const str = Math.min(1, (0.85 + rangeBoost) * volDamp);
        return {
          action: 'buy',
          reason: `평균회귀 매수 (괴리:${deviation.toFixed(2)}ATR, RSI:${currRSI.toFixed(0)}, ${market.state})`,
          strength: str,
        };
      }
    }

    // 3) BB 하단 + KC 하단 동시 근접 (더블 컨펌)
    //    v2: RSI 35→40 확장
    if (percentB < 0.1 && currPrice < lowerKC * 1.005) {
      if (currRSI < 40 && currRSI > prevRSI && volumeConfirm) {
        const str = Math.min(1, (0.9 + rangeBoost) * volDamp);
        return {
          action: 'buy',
          reason: `BB+KC 하단 동시 (%%B:${percentB.toFixed(2)}, ${market.state})`,
          strength: str,
        };
      }
    }

    // 4) EMA 근접 + RSI 중립 반등 (약한 회귀 신호)
    //    v2: RSI 상한 55→60 확장, 괴리 조건 완화
    if (Math.abs(deviation) < 0.6 && prevDeviation < -0.7 && currRSI > 40 && currRSI < 60) {
      if (currPrice > prevPrice && currRSI > prevRSI) {
        const str = Math.min(1, (0.65 + rangeBoost) * volDamp);
        return { action: 'buy', reason: `EMA 회귀완료 반등 (${market.state})`, strength: str };
      }
    }

    // v2 신규: 5) 레인지 바운드 하단 매수 (횡보장 only)
    if (market.state === 'ranging' && market.rangeBound && market.stateConfidence > 0.4) {
      const rb = market.rangeBound;
      const nearLower = currPrice <= rb.lower * 1.003; // 하단 0.3% 이내
      if (nearLower && currRSI < 50 && currRSI > prevRSI && currPrice > prevPrice) {
        const str = Math.min(1, (0.75 + rangeBoost) * volDamp);
        return {
          action: 'buy',
          reason: `레인지 하단 바운스 (${rb.lower.toFixed(0)}, RSI:${currRSI.toFixed(0)})`,
          strength: str,
        };
      }
    }

    // ========== 매도 (과매수 → 평균 회귀) ==========

    // 6) 상단 Keltner 이탈 후 진입 복귀
    //    v2: RSI 55→50 확장
    if (prevPrice >= prevUpperKC && currPrice < upperKC && currPrice < prevPrice) {
      if (currRSI > 50 && currRSI < prevRSI && volumeConfirm) {
        const depthBonus = Math.min(Math.abs(deviation) * 0.15, 0.2);
        const str = Math.min(1, (0.8 + depthBonus + rangeBoost) * volDamp);
        return {
          action: 'sell',
          reason: `KC 상단 복귀 (괴리:${deviation.toFixed(2)}ATR, ${market.state})`,
          strength: str,
        };
      }
    }

    // 7) 강한 상방 이탈 + 하락 시작
    //    v2: RSI 60→55 확장
    if (deviation > deviationThreshold && returningToMean && currRSI < prevRSI) {
      if (currRSI > 55 && volumeConfirm) {
        const str = Math.min(1, (0.85 + rangeBoost) * volDamp);
        return {
          action: 'sell',
          reason: `평균회귀 매도 (괴리:${deviation.toFixed(2)}ATR, RSI:${currRSI.toFixed(0)}, ${market.state})`,
          strength: str,
        };
      }
    }

    // 8) BB 상단 + KC 상단 동시 근접
    //    v2: RSI 65→60 확장
    if (percentB > 0.9 && currPrice > upperKC * 0.995) {
      if (currRSI > 60 && currRSI < prevRSI && volumeConfirm) {
        const str = Math.min(1, (0.9 + rangeBoost) * volDamp);
        return {
          action: 'sell',
          reason: `BB+KC 상단 동시 (%%B:${percentB.toFixed(2)}, ${market.state})`,
          strength: str,
        };
      }
    }

    // 9) EMA 근접 + RSI 중립 반락
    //    v2: RSI 하한 45→40 확장
    if (Math.abs(deviation) < 0.6 && prevDeviation > 0.7 && currRSI > 40 && currRSI < 60) {
      if (currPrice < prevPrice && currRSI < prevRSI) {
        const str = Math.min(1, (0.65 + rangeBoost) * volDamp);
        return { action: 'sell', reason: `EMA 회귀완료 반락 (${market.state})`, strength: str };
      }
    }

    // v2 신규: 10) 레인지 바운드 상단 매도 (횡보장 only)
    if (market.state === 'ranging' && market.rangeBound && market.stateConfidence > 0.4) {
      const rb = market.rangeBound;
      const nearUpper = currPrice >= rb.upper * 0.997; // 상단 0.3% 이내
      if (nearUpper && currRSI > 50 && currRSI < prevRSI && currPrice < prevPrice) {
        const str = Math.min(1, (0.75 + rangeBoost) * volDamp);
        return {
          action: 'sell',
          reason: `레인지 상단 반락 (${rb.upper.toFixed(0)}, RSI:${currRSI.toFixed(0)})`,
          strength: str,
        };
      }
    }

    return { action: 'hold', reason: `회귀 대기 (괴리:${deviation.toFixed(2)}ATR, ${market.state})`, strength: 0 };
  }
}

module.exports = MeanReversion;
