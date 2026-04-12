/**
 * SQLite 기반 데이터 저장소
 * - jsonStore.js의 drop-in 대체 (동일 API)
 * - trades, orders: 정규 테이블 (인덱스 기반 쿼리)
 * - 나머지 (config 등): key-value JSON blob 저장
 * - 페이지네이션 지원 추가
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.SQLITE_DATA_DIR || path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(DATA_DIR, 'trading.db');
const db = new Database(DB_PATH);

// WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// === Schema ===
db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    market TEXT,
    price REAL,
    volume REAL,
    amount REAL,
    entryPrice REAL,
    exitPrice REAL,
    pnl REAL,
    pnlPercent REAL,
    reason TEXT,
    strategy TEXT,
    timestamp TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    market TEXT,
    side TEXT,
    price REAL,
    volume REAL,
    amount REAL,
    orderId TEXT,
    status TEXT,
    mode TEXT,
    timestamp TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market);
  CREATE INDEX IF NOT EXISTS idx_trades_type ON trades(type);
  CREATE INDEX IF NOT EXISTS idx_trades_createdAt ON trades(createdAt);
  CREATE INDEX IF NOT EXISTS idx_orders_market ON orders(market);
  CREATE INDEX IF NOT EXISTS idx_orders_createdAt ON orders(createdAt);

  CREATE TABLE IF NOT EXISTS strategy_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy TEXT NOT NULL,
    market TEXT,
    totalTrades INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    totalPnl REAL DEFAULT 0,
    avgPnl REAL DEFAULT 0,
    winRate REAL DEFAULT 0,
    maxWin REAL DEFAULT 0,
    maxLoss REAL DEFAULT 0,
    avgHoldBars INTEGER DEFAULT 0,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_strategy_stats_key ON strategy_stats(strategy, market);
`);

// === Prepared statements ===
const stmts = {
  insertTrade: db.prepare(`
    INSERT INTO trades (type, market, price, volume, amount, entryPrice, exitPrice, pnl, pnlPercent, reason, strategy, timestamp, createdAt)
    VALUES (@type, @market, @price, @volume, @amount, @entryPrice, @exitPrice, @pnl, @pnlPercent, @reason, @strategy, @timestamp, @createdAt)
  `),
  insertOrder: db.prepare(`
    INSERT INTO orders (type, market, side, price, volume, amount, orderId, status, mode, timestamp, createdAt)
    VALUES (@type, @market, @side, @price, @volume, @amount, @orderId, @status, @mode, @timestamp, @createdAt)
  `),
  kvGet: db.prepare('SELECT value FROM kv_store WHERE key = ?'),
  kvSet: db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, updatedAt) VALUES (?, ?, datetime('now'))`),
};

// Mapping of filenames to structured tables
const STRUCTURED_TABLES = {
  'trades.json': 'trades',
  'orders.json': 'orders',
};

/**
 * Normalize item for DB insert (null out undefined fields)
 */
function normalizeForInsert(item, fields) {
  const row = {};
  for (const f of fields) {
    row[f] = item[f] !== undefined ? item[f] : null;
  }
  return row;
}

const TRADE_FIELDS = [
  'type',
  'market',
  'price',
  'volume',
  'amount',
  'entryPrice',
  'exitPrice',
  'pnl',
  'pnlPercent',
  'reason',
  'strategy',
  'timestamp',
  'createdAt',
];
const ORDER_FIELDS = [
  'type',
  'market',
  'side',
  'price',
  'volume',
  'amount',
  'orderId',
  'status',
  'mode',
  'timestamp',
  'createdAt',
];

/**
 * JSON 호환 load — 파일명 기반
 */
function load(filename, defaultValue = []) {
  const table = STRUCTURED_TABLES[filename];
  if (table === 'trades') {
    return db.prepare('SELECT * FROM trades ORDER BY id').all();
  }
  if (table === 'orders') {
    return db.prepare('SELECT * FROM orders ORDER BY id').all();
  }
  // KV fallback (config files, backtest results, etc.)
  const row = stmts.kvGet.get(filename);
  if (!row) return defaultValue;
  return JSON.parse(row.value);
}

/**
 * JSON 호환 save — 파일명 기반
 */
function save(filename, data) {
  const table = STRUCTURED_TABLES[filename];
  if (table === 'trades') {
    const tx = db.transaction((items) => {
      db.prepare('DELETE FROM trades').run();
      for (const item of items) {
        const row = normalizeForInsert(item, TRADE_FIELDS);
        if (!row.createdAt) row.createdAt = new Date().toISOString();
        stmts.insertTrade.run(row);
      }
    });
    tx(Array.isArray(data) ? data : []);
    return;
  }
  if (table === 'orders') {
    const tx = db.transaction((items) => {
      db.prepare('DELETE FROM orders').run();
      for (const item of items) {
        const row = normalizeForInsert(item, ORDER_FIELDS);
        if (!row.createdAt) row.createdAt = new Date().toISOString();
        stmts.insertOrder.run(row);
      }
    });
    tx(Array.isArray(data) ? data : []);
    return;
  }
  stmts.kvSet.run(filename, JSON.stringify(data));
}

/**
 * JSON 호환 append
 */
function append(filename, item) {
  const now = new Date().toISOString();
  const table = STRUCTURED_TABLES[filename];
  if (table === 'trades') {
    const row = normalizeForInsert({ ...item, createdAt: now, timestamp: item.timestamp || now }, TRADE_FIELDS);
    stmts.insertTrade.run(row);
    return; // Don't return full array for perf
  }
  if (table === 'orders') {
    const row = normalizeForInsert({ ...item, createdAt: now, timestamp: item.timestamp || now }, ORDER_FIELDS);
    stmts.insertOrder.run(row);
    return;
  }
  // KV fallback — load, push, save
  const data = load(filename, []);
  data.push({ ...item, createdAt: now });
  save(filename, data);
  return data;
}

/**
 * JSON 호환 find
 */
function find(filename, predicate) {
  const data = load(filename, []);
  return data.filter(predicate);
}

/**
 * JSON 호환 update
 */
function update(filename, id, updates) {
  const data = load(filename, []);
  const idx = data.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  data[idx] = { ...data[idx], ...updates, updatedAt: new Date().toISOString() };
  save(filename, data);
  return data[idx];
}

// === Extended API: Pagination & Queries ===

/**
 * 페이지네이션된 거래 조회
 * @param {Object} opts - { market, type, limit, offset, orderBy }
 */
function queryTrades(opts = {}) {
  const { market, type, limit = 50, offset = 0, orderBy = 'id DESC' } = opts;
  const conditions = [];
  const params = {};
  if (market) {
    conditions.push('market = @market');
    params.market = market;
  }
  if (type) {
    conditions.push('type = @type');
    params.type = type;
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  // Whitelist orderBy to prevent injection
  const safeOrder = ['id ASC', 'id DESC', 'createdAt ASC', 'createdAt DESC', 'pnl ASC', 'pnl DESC'].includes(orderBy)
    ? orderBy
    : 'id DESC';
  const rows = db
    .prepare(`SELECT * FROM trades ${where} ORDER BY ${safeOrder} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM trades ${where}`).get(params);
  return { rows, total: countRow.total, limit, offset };
}

/**
 * 페이지네이션된 주문 조회
 */
function queryOrders(opts = {}) {
  const { market, limit = 50, offset = 0 } = opts;
  const conditions = [];
  const params = {};
  if (market) {
    conditions.push('market = @market');
    params.market = market;
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const rows = db
    .prepare(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM orders ${where}`).get(params);
  return { rows, total: countRow.total, limit, offset };
}

/**
 * 거래 통계 조회
 */
function tradeStats(market) {
  const where = market ? 'WHERE market = ?' : '';
  const args = market ? [market] : [];
  return db
    .prepare(
      `
    SELECT
      COUNT(*) as totalTrades,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses,
      ROUND(SUM(pnl), 2) as totalPnl,
      ROUND(AVG(pnl), 2) as avgPnl,
      ROUND(MAX(pnl), 2) as maxWin,
      ROUND(MIN(pnl), 2) as maxLoss
    FROM trades
    ${where} AND type IN ('sell', 'partial-sell')
  `.replace('AND', where ? 'AND' : 'WHERE'),
    )
    .get(...args);
}

/**
 * DB 닫기 (graceful shutdown)
 */
function close() {
  db.close();
}

/**
 * 전략별 실전 성과 갱신 — 매 sell 거래 후 호출
 */
function updateStrategyStats(strategy, market) {
  if (!strategy) return;
  const mkt = market || 'ALL';
  const row = db
    .prepare(
      `
    SELECT
      COUNT(*) as totalTrades,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
      ROUND(SUM(pnl), 2) as totalPnl,
      ROUND(AVG(pnl), 2) as avgPnl,
      ROUND(MAX(pnl), 2) as maxWin,
      ROUND(MIN(pnl), 2) as maxLoss
    FROM trades
    WHERE strategy = @strategy AND type IN ('sell', 'partial-sell')
  `,
    )
    .get({ strategy });
  if (!row || row.totalTrades === 0) return;
  const winRate = row.totalTrades > 0 ? Math.round((row.wins / row.totalTrades) * 10000) / 10000 : 0;
  db.prepare(
    `
    INSERT INTO strategy_stats (strategy, market, totalTrades, wins, losses, totalPnl, avgPnl, winRate, maxWin, maxLoss, updatedAt)
    VALUES (@strategy, @market, @totalTrades, @wins, @losses, @totalPnl, @avgPnl, @winRate, @maxWin, @maxLoss, datetime('now'))
    ON CONFLICT(strategy, market) DO UPDATE SET
      totalTrades=@totalTrades, wins=@wins, losses=@losses, totalPnl=@totalPnl,
      avgPnl=@avgPnl, winRate=@winRate, maxWin=@maxWin, maxLoss=@maxLoss, updatedAt=datetime('now')
  `,
  ).run({ strategy, market: mkt, ...row, winRate });
}

/**
 * 전략 성과 조회
 */
function getStrategyStats(strategy) {
  if (strategy) {
    return db.prepare('SELECT * FROM strategy_stats WHERE strategy = ?').all(strategy);
  }
  return db.prepare('SELECT * FROM strategy_stats ORDER BY totalPnl DESC').all();
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
  db,
};
