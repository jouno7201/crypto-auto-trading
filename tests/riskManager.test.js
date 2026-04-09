/**
 * 리스크 관리 모듈 테스트
 * - 손절/익절 가격 계산
 * - 포지션 사이징
 * - 일일 손실 한도
 * - 매매 허용 판단
 */

const RiskManager = require('../src/engine/riskManager');

describe('RiskManager', () => {
  let rm;

  beforeEach(() => {
    rm = new RiskManager({
      stopLossPercent: 3,
      takeProfitPercent: 5,
      maxPositionRatio: 0.3,
      maxTotalExposure: 0.9,
      dailyMaxLossPercent: 5,
      fixedRiskRatio: 0.02,
    });
    rm.setDailyStart(1_000_000);
  });

  // ── 손절/익절 ──

  describe('getExitPrices', () => {
    test('손절가 = 진입가 × (1 - SL%)', () => {
      const exits = rm.getExitPrices(100_000);
      expect(exits.stopLoss).toBe(97_000);
      expect(exits.takeProfit).toBe(105_000);
    });
  });

  describe('checkExit', () => {
    test('가격 하락 → 손절 트리거', () => {
      const result = rm.checkExit(100_000, 96_000);
      expect(result.shouldExit).toBe(true);
      expect(result.type).toBe('stop-loss');
    });

    test('가격 상승 → 익절 트리거', () => {
      const result = rm.checkExit(100_000, 106_000);
      expect(result.shouldExit).toBe(true);
      expect(result.type).toBe('take-profit');
    });

    test('가격 범위 내 → 유지', () => {
      const result = rm.checkExit(100_000, 101_000);
      expect(result.shouldExit).toBe(false);
      expect(result.pnlPercent).toBeCloseTo(1.0, 1);
    });

    test('정확히 손절가 → 손절', () => {
      const result = rm.checkExit(100_000, 97_000);
      expect(result.shouldExit).toBe(true);
      expect(result.type).toBe('stop-loss');
    });
  });

  // ── 매매 허용 판단 ──

  describe('canTrade', () => {
    test('정상 상태 → 매매 허용', () => {
      const result = rm.canTrade(1_000_000, []);
      expect(result.allowed).toBe(true);
    });

    test('일일 손실 한도 초과 → 매매 불가', () => {
      const result = rm.canTrade(940_000, []); // 6% 손실
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/일일/);
    });

    test('전체 투자비율 한도 초과 → 매매 불가', () => {
      // 자본 100만, 포지션 900만 → 노출 비율 90%
      const result = rm.canTrade(1_000_000, [{ value: 9_000_000 }]);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/투자비율/);
    });

    test('매매 중지 후 → 항상 불가', () => {
      rm.canTrade(940_000, []); // 한도 트리거
      const result = rm.canTrade(1_000_000, []); // 자본 회복해도
      expect(result.allowed).toBe(false);
    });
  });

  // ── 포지션 사이징 ──

  describe('calculatePositionSize', () => {
    test('투자금이 자본 초과 불가', () => {
      const sizing = rm.calculatePositionSize(100_000, 50_000_000, []);
      expect(sizing.investAmount).toBeLessThanOrEqual(100_000);
    });

    test('종목당 최대 비율 제한', () => {
      const sizing = rm.calculatePositionSize(10_000_000, 50_000_000, []);
      expect(sizing.investAmount).toBeLessThanOrEqual(10_000_000 * 0.3);
    });

    test('volume = investAmount / price', () => {
      const sizing = rm.calculatePositionSize(1_000_000, 100_000, []);
      expect(sizing.volume).toBeCloseTo(sizing.investAmount / 100_000, 4);
    });
  });

  // ── 상태 조회 ──

  describe('getStatus', () => {
    test('올바른 형태 반환', () => {
      const status = rm.getStatus(1_000_000, [{ value: 300_000 }]);
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('tradingHalted', false);
      expect(status.totalExposure).toBe(300_000);
      expect(status.totalAssets).toBe(1_300_000);
      expect(status.exposureRatio).toBeCloseTo(23.1, 0);
    });
  });
});
