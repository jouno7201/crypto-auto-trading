/**
 * 스마트 레인지 전략 (Smart Range)
 * - 횡보/레인징 시장 전용 전략
 * - 지지/저항 레벨 동적 감지 (피벗 기반)
 * - RSI + 볼륨 컨펌으로 바운스 매매
 * - 시장 상태 필터: 횡보장에서만 활성
 * - 레인지 이탈(브레이크아웃) 시 자동 중립
 */

const BaseStrategy = require('./BaseStrategy');
const { ema, rsi, atr, bollingerBands, sma } = require('./indicators');
const { detectMarketState } = require('./marketDetector');

class SmartRange extends BaseStrategy {
  constructor(params = {}) {
    super('Smart Range', {
      // 레인지 감지
      pivotLookback: 5, // 피벗 포인트 탐색 기간 (봉 수)
      srLookback: 40, // S/R 레벨 탐색 기간
      srClusterPct: 0.5, // S/R 클러스터 병합 범위 (%)
      // 진입 조건
      srProximityPct: 0.3, // S/R 접근 임계값 (%)
      rsiOversold: 40, // RSI 과매도 기준 (표준 30보다 완화)
      rsiOverbought: 60, // RSI 과매수 기준 (표준 70보다 완화)
      // 필터
      maxADX: 22, // ADX > 22 이면 추세장으로 간주 → 비활성
      minRangeWidth: 1.0, // 최소 레인지 폭 (%, 너무 좁으면 비활성)
      maxRangeWidth: 8.0, // 최대 레인지 폭 (%, 너무 넓으면 비활성)
      volumeLookback: 10, // 볼륨 비교 기간
      ...params,
    });
  }

  analyze(candles) {
    if (candles.length < this.params.srLookback + 10) {
      return { action: 'hold', reason: '데이터 부족', strength: 0 };
    }

    // 시장 상태 확인 — 횡보장에서만 활성
    const market = detectMarketState(candles);
    if (market.state === 'volatile') {
      return { action: 'hold', reason: `변동성장 회피 [volatile]`, strength: 0 };
    }
    if ((market.state === 'trending-up' || market.state === 'trending-down') && market.adx >= this.params.maxADX) {
      return { action: 'hold', reason: `추세장 회피 (ADX:${market.adx})`, strength: 0 };
    }

    // S/R 레벨 감지
    const levels = this._detectSRLevels(candles);
    if (!levels.support || !levels.resistance) {
      return { action: 'hold', reason: `S/R 미감지`, strength: 0 };
    }

    const currPrice = candles[candles.length - 1].close;
    const rangeWidth = currPrice > 0 ? ((levels.resistance - levels.support) / currPrice) * 100 : 0;

    // 레인지 폭 필터
    if (rangeWidth < this.params.minRangeWidth || rangeWidth > this.params.maxRangeWidth) {
      return { action: 'hold', reason: `레인지 폭 부적합 (${rangeWidth.toFixed(1)}%)`, strength: 0 };
    }

    // 브레이크아웃 감지 — 레인지 이탈 시 중립
    if (currPrice > levels.resistance * 1.005 || currPrice < levels.support * 0.995) {
      return {
        action: 'hold',
        reason: `레인지 이탈 (${currPrice > levels.resistance ? '상방' : '하방'})`,
        strength: 0,
      };
    }

    // 지표 계산
    const closes = candles.map((c) => c.close);
    const rsiValues = rsi(closes, 14);
    const atrValues = atr(candles, 14);

    if (rsiValues.length < 3 || atrValues.length < 2) {
      return { action: 'hold', reason: '지표 부족', strength: 0 };
    }

    const currRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];
    const prevPrice = candles[candles.length - 2].close;
    const currATR = atrValues[atrValues.length - 1];

    // S/R 까지 거리 (% 기준)
    const distToSupport = currPrice > 0 ? ((currPrice - levels.support) / currPrice) * 100 : 999;
    const distToResistance = currPrice > 0 ? ((levels.resistance - currPrice) / currPrice) * 100 : 999;

    // 볼륨 확인
    const volConfirm = this._checkVolume(candles);

    // 레인지 내 위치 (0=지지선, 1=저항선)
    const rangePct =
      levels.resistance > levels.support ? (currPrice - levels.support) / (levels.resistance - levels.support) : 0.5;

    // ========== 매수 (지지선 부근 바운스) ==========
    if (distToSupport <= this.params.srProximityPct) {
      // 지지선 근접 + RSI 과매도 + 반등 시작
      if (currRSI < this.params.rsiOversold && currRSI > prevRSI && currPrice > prevPrice) {
        const depthBonus = Math.min(0.15, (1 - rangePct) * 0.2);
        let strength = 0.8 + depthBonus;
        if (volConfirm) strength = Math.min(1, strength + 0.05);
        // 횡보 신뢰도 반영
        if (market.stateConfidence > 0.5) strength = Math.min(1, strength + 0.05);
        return {
          action: 'buy',
          reason: `지지선 바운스 (S:${levels.support.toFixed(0)}, RSI:${currRSI.toFixed(0)}, 거리:${distToSupport.toFixed(2)}%)`,
          strength,
        };
      }
      // 지지선 근접 + 약한 RSI 반등 (RSI 조건 완화)
      if (currRSI < 50 && currRSI > prevRSI && currPrice >= prevPrice) {
        return {
          action: 'buy',
          reason: `지지선 접근 (S:${levels.support.toFixed(0)}, RSI:${currRSI.toFixed(0)})`,
          strength: 0.65,
        };
      }
    }

    // 레인지 하위 25% + RSI 과매도 반등
    if (rangePct < 0.25 && currRSI < this.params.rsiOversold && currRSI > prevRSI) {
      if (currPrice > prevPrice && volConfirm) {
        return {
          action: 'buy',
          reason: `레인지 하단 반등 (위치:${(rangePct * 100).toFixed(0)}%, RSI:${currRSI.toFixed(0)})`,
          strength: 0.7,
        };
      }
    }

    // ========== 매도 (저항선 부근 반락) ==========
    if (distToResistance <= this.params.srProximityPct) {
      // 저항선 근접 + RSI 과매수 + 반락 시작
      if (currRSI > this.params.rsiOverbought && currRSI < prevRSI && currPrice < prevPrice) {
        const depthBonus = Math.min(0.15, rangePct * 0.2);
        let strength = 0.8 + depthBonus;
        if (volConfirm) strength = Math.min(1, strength + 0.05);
        if (market.stateConfidence > 0.5) strength = Math.min(1, strength + 0.05);
        return {
          action: 'sell',
          reason: `저항선 반락 (R:${levels.resistance.toFixed(0)}, RSI:${currRSI.toFixed(0)}, 거리:${distToResistance.toFixed(2)}%)`,
          strength,
        };
      }
      // 저항선 근접 + 약한 RSI 반락
      if (currRSI > 50 && currRSI < prevRSI && currPrice <= prevPrice) {
        return {
          action: 'sell',
          reason: `저항선 접근 (R:${levels.resistance.toFixed(0)}, RSI:${currRSI.toFixed(0)})`,
          strength: 0.65,
        };
      }
    }

    // 레인지 상위 75% + RSI 과매수 반락
    if (rangePct > 0.75 && currRSI > this.params.rsiOverbought && currRSI < prevRSI) {
      if (currPrice < prevPrice && volConfirm) {
        return {
          action: 'sell',
          reason: `레인지 상단 반락 (위치:${(rangePct * 100).toFixed(0)}%, RSI:${currRSI.toFixed(0)})`,
          strength: 0.7,
        };
      }
    }

    return {
      action: 'hold',
      reason: `레인지 대기 (위치:${(rangePct * 100).toFixed(0)}%, S:${levels.support.toFixed(0)}~R:${levels.resistance.toFixed(0)})`,
      strength: 0,
    };
  }

  /**
   * 피벗 포인트 기반 S/R 레벨 감지
   * - 최근 N봉에서 피벗 하이/로우 추출
   * - 가격 클러스터링으로 주요 레벨 병합
   */
  _detectSRLevels(candles) {
    const { pivotLookback, srLookback, srClusterPct } = this.params;
    const recent = candles.slice(-srLookback);
    const currPrice = candles[candles.length - 1].close;

    const pivotHighs = [];
    const pivotLows = [];

    for (let i = pivotLookback; i < recent.length - pivotLookback; i++) {
      let isHigh = true;
      let isLow = true;

      for (let j = 1; j <= pivotLookback; j++) {
        if (recent[i].high <= recent[i - j].high || recent[i].high <= recent[i + j].high) isHigh = false;
        if (recent[i].low >= recent[i - j].low || recent[i].low >= recent[i + j].low) isLow = false;
      }

      if (isHigh) pivotHighs.push(recent[i].high);
      if (isLow) pivotLows.push(recent[i].low);
    }

    if (pivotHighs.length === 0 && pivotLows.length === 0) {
      return { support: null, resistance: null };
    }

    // 클러스터링: 유사 가격대 병합
    const clusterLevels = (levels) => {
      if (levels.length === 0) return [];
      const sorted = [...levels].sort((a, b) => a - b);
      const clusters = [];
      let cluster = [sorted[0]];

      for (let i = 1; i < sorted.length; i++) {
        const diff = currPrice > 0 ? ((sorted[i] - cluster[cluster.length - 1]) / currPrice) * 100 : 0;
        if (diff <= srClusterPct) {
          cluster.push(sorted[i]);
        } else {
          clusters.push(cluster.reduce((a, b) => a + b, 0) / cluster.length);
          cluster = [sorted[i]];
        }
      }
      clusters.push(cluster.reduce((a, b) => a + b, 0) / cluster.length);
      return clusters;
    };

    const resistanceLevels = clusterLevels(pivotHighs).filter((r) => r > currPrice * 0.99);
    const supportLevels = clusterLevels(pivotLows).filter((s) => s < currPrice * 1.01);

    // 현재 가격에 가장 가까운 S/R 선택
    const resistance =
      resistanceLevels.length > 0
        ? resistanceLevels.reduce((a, b) => (Math.abs(a - currPrice) < Math.abs(b - currPrice) ? a : b))
        : null;
    const support =
      supportLevels.length > 0
        ? supportLevels.reduce((a, b) => (Math.abs(a - currPrice) < Math.abs(b - currPrice) ? a : b))
        : null;

    return { support, resistance, resistanceLevels, supportLevels };
  }

  /**
   * 볼륨 확인 — 평균 이상 볼륨 시 신뢰도 높음
   */
  _checkVolume(candles) {
    const { volumeLookback } = this.params;
    if (candles.length < volumeLookback + 1) return true;
    const curr = candles[candles.length - 1];
    if (curr.volume == null) return true;

    const recentVols = candles.slice(-(volumeLookback + 1), -1).map((c) => c.volume || 0);
    const avgVol = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
    return avgVol === 0 || curr.volume >= avgVol * 0.7;
  }
}

module.exports = SmartRange;
