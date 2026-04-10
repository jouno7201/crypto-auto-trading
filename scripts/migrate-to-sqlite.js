#!/usr/bin/env node
/**
 * JSON → SQLite 마이그레이션 스크립트
 *
 * 기존 data/ 폴더의 JSON 파일들을 SQLite DB로 임포트합니다.
 * 기존 JSON 파일은 삭제하지 않으며 백업으로 유지됩니다.
 *
 * 사용: node scripts/migrate-to-sqlite.js
 */

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data');

// Import sqliteStore (creates DB + tables)
const store = require('../src/store/sqliteStore');

console.log('=== JSON → SQLite 마이그레이션 시작 ===\n');

function loadJson(filename) {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

let totalRecords = 0;

// 1. Trades
const trades = loadJson('trades.json');
if (trades && trades.length) {
  console.log(`trades.json: ${trades.length}건 발견`);
  store.save('trades.json', trades);
  totalRecords += trades.length;
  console.log(`  → trades 테이블에 ${trades.length}건 임포트 완료`);
} else {
  console.log('trades.json: 없음 또는 비어있음');
}

// 2. Orders
const orders = loadJson('orders.json');
if (orders && orders.length) {
  console.log(`orders.json: ${orders.length}건 발견`);
  store.save('orders.json', orders);
  totalRecords += orders.length;
  console.log(`  → orders 테이블에 ${orders.length}건 임포트 완료`);
} else {
  console.log('orders.json: 없음 또는 비어있음');
}

// 3. Config files (KV store)
const kvFiles = ['bot-state.json', 'bot-manager.json', 'strategies.json', 'risk-config.json'];
for (const f of kvFiles) {
  const data = loadJson(f);
  if (data !== null) {
    store.save(f, data);
    totalRecords++;
    console.log(`${f}: KV 저장 완료`);
  }
}

// 4. Backtest results (subdirectory)
const btDir = path.join(DATA_DIR, 'backtest-results');
if (fs.existsSync(btDir)) {
  const btFiles = fs.readdirSync(btDir).filter(f => f.endsWith('.json'));
  console.log(`\nbacktest-results/: ${btFiles.length}개 파일`);
  for (const f of btFiles) {
    const data = loadJson(path.join('backtest-results', f));
    if (data) {
      store.save(`backtest-results/${f}`, data);
      totalRecords++;
    }
  }
  console.log(`  → ${btFiles.length}개 백테스트 결과 KV 저장 완료`);
}

// 5. Candle cache files
const candleDir = path.join(DATA_DIR, 'candles');
if (fs.existsSync(candleDir)) {
  const candleFiles = fs.readdirSync(candleDir).filter(f => f.endsWith('.json'));
  console.log(`\ncandles/: ${candleFiles.length}개 캐시 파일`);
  for (const f of candleFiles) {
    const data = loadJson(path.join('candles', f));
    if (data) {
      store.save(`candles/${f}`, data);
      totalRecords++;
    }
  }
  console.log(`  → ${candleFiles.length}개 캔들 캐시 KV 저장 완료`);
}

store.close();

console.log(`\n=== 마이그레이션 완료 ===`);
console.log(`총 ${totalRecords}건 처리`);
console.log(`DB 위치: ${path.join(DATA_DIR, 'trading.db')}`);
console.log('\n기존 JSON 파일은 data/ 폴더에 백업으로 유지됩니다.');
