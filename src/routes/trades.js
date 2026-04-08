/**
 * API 라우트 - 매매 기록
 */
const express = require('express');
const router = express.Router();
const store = require('../store/jsonStore');

// 매매 내역 조회
router.get('/', (req, res) => {
  const { market, limit } = req.query;
  let trades = store.load('trades.json', []);
  if (market) trades = trades.filter((t) => t.market === market);
  if (limit) trades = trades.slice(-parseInt(limit, 10));
  res.json(trades);
});

// 주문 로그 조회
router.get('/orders', (req, res) => {
  const { limit } = req.query;
  let orders = store.load('orders.json', []);
  if (limit) orders = orders.slice(-parseInt(limit, 10));
  res.json(orders);
});

module.exports = router;
