/**
 * 하이브리드 데이터 저장소
 * - trades.json, orders.json → SQLite (인덱스 기반 쿼리, 페이지네이션)
 * - 나머지 (config, backtest, candles) → JSON 파일 유지
 * - 기존 API 100% 호환
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

// data/ 하위 폴더 자동 생성
const DIRS = [
  DATA_DIR,
  path.join(DATA_DIR, 'backtest-results'),
  path.join(DATA_DIR, 'snapshots'),
  path.join(DATA_DIR, 'candles'),
];
DIRS.forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// SQLite for structured data
let sqlite = null;
try {
  sqlite = require('./sqliteStore');
} catch (e) {
  // SQLite not available — pure JSON fallback
}

// Files that use SQLite when available
const SQLITE_FILES = new Set(['trades.json', 'orders.json']);

function useSqlite(filename) {
  return sqlite && SQLITE_FILES.has(filename);
}

// === JSON file helpers ===
function jsonLoad(filename, defaultValue = []) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return defaultValue;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function jsonSave(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// === Public API (backward compatible) ===

function load(filename, defaultValue = []) {
  if (useSqlite(filename)) return sqlite.load(filename, defaultValue);
  return jsonLoad(filename, defaultValue);
}

function save(filename, data) {
  if (useSqlite(filename)) return sqlite.save(filename, data);
  return jsonSave(filename, data);
}

function append(filename, item) {
  if (useSqlite(filename)) return sqlite.append(filename, item);
  const data = jsonLoad(filename, []);
  data.push({ ...item, createdAt: new Date().toISOString() });
  jsonSave(filename, data);
  return data;
}

function find(filename, predicate) {
  const data = load(filename, []);
  return data.filter(predicate);
}

function update(filename, id, updates) {
  const data = load(filename, []);
  const idx = data.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  data[idx] = { ...data[idx], ...updates, updatedAt: new Date().toISOString() };
  save(filename, data);
  return data[idx];
}

// === Extended API (SQLite only) ===
function queryTrades(opts) {
  if (sqlite) return sqlite.queryTrades(opts);
  // Fallback: in-memory filtering
  let trades = jsonLoad('trades.json', []);
  if (opts.market) trades = trades.filter((t) => t.market === opts.market);
  if (opts.type) trades = trades.filter((t) => t.type === opts.type);
  const total = trades.length;
  const offset = opts.offset || 0;
  const limit = opts.limit || 50;
  return { rows: trades.slice(offset, offset + limit), total, limit, offset };
}

function queryOrders(opts) {
  if (sqlite) return sqlite.queryOrders(opts);
  let orders = jsonLoad('orders.json', []);
  if (opts.market) orders = orders.filter((o) => o.market === opts.market);
  const total = orders.length;
  const offset = opts.offset || 0;
  const limit = opts.limit || 50;
  return { rows: orders.slice(offset, offset + limit), total, limit, offset };
}

function tradeStats(market) {
  if (sqlite) return sqlite.tradeStats(market);
  return null;
}

function updateStrategyStats(strategy, market) {
  if (sqlite) return sqlite.updateStrategyStats(strategy, market);
}

function getStrategyStats(strategy) {
  if (sqlite) return sqlite.getStrategyStats(strategy);
  return [];
}

function close() {
  if (sqlite) sqlite.close();
}

module.exports = {
  load,
  save,
  append,
  find,
  update,
  queryTrades,
  queryOrders,
  tradeStats,
  updateStrategyStats,
  getStrategyStats,
  close,
  DATA_DIR,
};
