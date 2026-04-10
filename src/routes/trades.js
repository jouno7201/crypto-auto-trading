/**
 * API 라우트 - 매매 기록
 */
const express = require('express');
const router = express.Router();
const store = require('../store/jsonStore');

// 매매 내역 조회 (페이지네이션 지원)
router.get('/', (req, res) => {
  const { market, type, limit, offset, page } = req.query;
  const limitNum = parseInt(limit, 10) || 50;
  const offsetNum = page ? (parseInt(page, 10) - 1) * limitNum : parseInt(offset, 10) || 0;

  const result = store.queryTrades({ market, type, limit: limitNum, offset: offsetNum });
  // Backward compatible: if no pagination params, return flat array
  if (!offset && !page) {
    // Legacy mode: return last N trades as array
    let trades = store.load('trades.json', []);
    if (market) trades = trades.filter((t) => t.market === market);
    if (type) trades = trades.filter((t) => t.type === type);
    if (limit) trades = trades.slice(-limitNum);
    return res.json(trades);
  }
  res.json(result);
});

// 매매 통계
router.get('/stats', (req, res) => {
  const { market } = req.query;
  const stats = store.tradeStats(market);
  res.json(stats || {});
});

// 주문 로그 조회 (페이지네이션 지원)
router.get('/orders', (req, res) => {
  const { market, limit, offset, page } = req.query;
  const limitNum = parseInt(limit, 10) || 50;
  const offsetNum = page ? (parseInt(page, 10) - 1) * limitNum : parseInt(offset, 10) || 0;

  if (!offset && !page) {
    let orders = store.load('orders.json', []);
    if (limit) orders = orders.slice(-limitNum);
    return res.json(orders);
  }
  res.json(store.queryOrders({ market, limit: limitNum, offset: offsetNum }));
});

module.exports = router;
