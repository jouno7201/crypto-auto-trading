/**
 * API 라우트 - 전략
 */
const express = require('express');
const router = express.Router();
const { STRATEGIES, RECOMMENDED, createStrategy } = require('../strategies');
const store = require('../store/jsonStore');

/**
 * 파라미터 검증 — 기본 인스턴스 params 기준
 * 규칙: 숫자만, NaN/Infinity 불가, 양수, 알 수 없는 키 불가
 * 추가 규칙: shortPeriod < longPeriod, fastPeriod < slowPeriod 등
 */
function validateParams(strategyId, newParams) {
  const Cls = STRATEGIES[strategyId];
  if (!Cls) return { valid: false, error: '전략 없음' };

  const defaults = new Cls().params;
  const errors = [];

  for (const [key, val] of Object.entries(newParams)) {
    // 알 수 없는 키
    if (!(key in defaults)) {
      errors.push(`알 수 없는 파라미터: ${key}`);
      continue;
    }
    // 숫자 타입
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      errors.push(`${key}: 유한한 숫자여야 합니다`);
      continue;
    }
    // 양수 (period, multiplier 등은 0보다 커야 함)
    if (val <= 0) {
      errors.push(`${key}: 0보다 커야 합니다`);
    }
  }

  // 교차 검증: shortPeriod < longPeriod
  const merged = { ...defaults, ...newParams };
  if (merged.shortPeriod != null && merged.longPeriod != null) {
    if (merged.shortPeriod >= merged.longPeriod) {
      errors.push('shortPeriod는 longPeriod보다 작아야 합니다');
    }
  }
  if (merged.fastPeriod != null && merged.slowPeriod != null) {
    if (merged.fastPeriod >= merged.slowPeriod) {
      errors.push('fastPeriod는 slowPeriod보다 작아야 합니다');
    }
  }

  return errors.length ? { valid: false, error: errors.join('; ') } : { valid: true };
}

// 전략 목록 조회
router.get('/', (req, res) => {
  const strategies = Object.entries(STRATEGIES).map(([key, Cls]) => {
    const instance = new Cls();
    const state = store.load('strategies.json', []).find((s) => s.id === key);
    return {
      id: key,
      name: instance.name,
      params: instance.params,
      enabled: state?.enabled ?? false,
      recommended: RECOMMENDED.includes(key),
    };
  });
  res.json(strategies);
});

// 전략 ON/OFF 토글
router.post('/:id/toggle', (req, res) => {
  const { id } = req.params;
  if (!STRATEGIES[id]) return res.status(404).json({ error: '전략 없음' });

  let strategies = store.load('strategies.json', []);
  const idx = strategies.findIndex((s) => s.id === id);
  if (idx >= 0) {
    strategies[idx].enabled = !strategies[idx].enabled;
  } else {
    strategies.push({ id, enabled: true });
  }
  store.save('strategies.json', strategies);
  res.json({ id, enabled: strategies.find((s) => s.id === id).enabled });
});

// 전략 파라미터 업데이트 (검증 포함)
router.put('/:id/params', (req, res) => {
  const { id } = req.params;
  if (!STRATEGIES[id]) return res.status(404).json({ error: '전략 없음' });

  // 입력 검증
  const validation = validateParams(id, req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  let strategies = store.load('strategies.json', []);
  const idx = strategies.findIndex((s) => s.id === id);
  if (idx >= 0) {
    strategies[idx].params = { ...strategies[idx].params, ...req.body };
  } else {
    strategies.push({ id, enabled: false, params: req.body });
  }
  store.save('strategies.json', strategies);
  res.json({ id, params: strategies.find((s) => s.id === id).params });
});

// 전략 실전 성과 조회
router.get('/stats', (req, res) => {
  const stats = store.getStrategyStats();
  res.json(stats);
});

router.get('/:id/stats', (req, res) => {
  const { id } = req.params;
  const stats = store.getStrategyStats(id);
  res.json(stats);
});

module.exports = router;
