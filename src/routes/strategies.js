/**
 * API 라우트 - 전략
 */
const express = require('express');
const router = express.Router();
const { STRATEGIES, RECOMMENDED, createStrategy } = require('../strategies');
const store = require('../store/jsonStore');

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

// 전략 파라미터 업데이트
router.put('/:id/params', (req, res) => {
  const { id } = req.params;
  if (!STRATEGIES[id]) return res.status(404).json({ error: '전략 없음' });

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

module.exports = router;
