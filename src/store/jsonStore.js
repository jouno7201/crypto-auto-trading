/**
 * JSON 파일 기반 데이터 저장소
 * - 모든 데이터는 data/ 폴더에 JSON 파일로 관리
 * - Phase 3 이후 필요 시 SQLite/PostgreSQL로 전환 가능
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

/**
 * JSON 파일 읽기 (없으면 기본값 반환)
 */
function load(filename, defaultValue = []) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return defaultValue;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * JSON 파일 쓰기
 */
function save(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 배열 JSON 파일에 항목 추가 (append)
 */
function append(filename, item) {
  const data = load(filename, []);
  data.push({ ...item, createdAt: new Date().toISOString() });
  save(filename, data);
  return data;
}

/**
 * 배열에서 조건에 맞는 항목 찾기
 */
function find(filename, predicate) {
  const data = load(filename, []);
  return data.filter(predicate);
}

/**
 * 배열에서 항목 업데이트 (id 기반)
 */
function update(filename, id, updates) {
  const data = load(filename, []);
  const idx = data.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  data[idx] = { ...data[idx], ...updates, updatedAt: new Date().toISOString() };
  save(filename, data);
  return data[idx];
}

module.exports = { load, save, append, find, update, DATA_DIR };
