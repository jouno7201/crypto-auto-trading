/**
 * Binance 거래소 연동 모듈
 * - 시세 조회
 * - 주문 실행 (market, limit)
 * - 잔고 조회
 *
 * 설정: .env에 BINANCE_API_KEY, BINANCE_SECRET_KEY 추가
 */

const https = require('https');
const crypto = require('crypto');
const log = require('../utils/logger');

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;
const BASE_URL = 'api.binance.com';

function isEnabled() {
  return !!(API_KEY && SECRET_KEY);
}

/**
 * HMAC SHA256 서명
 */
function sign(queryString) {
  return crypto.createHmac('sha256', SECRET_KEY).update(queryString).digest('hex');
}

/**
 * Binance API 호출
 */
function request(method, path, params = {}, signed = false) {
  return new Promise((resolve, reject) => {
    let queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    if (signed) {
      params.timestamp = Date.now();
      queryString = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      queryString += `&signature=${sign(queryString)}`;
    }

    const fullPath = queryString ? `${path}?${queryString}` : path;

    const options = {
      hostname: BASE_URL,
      path: fullPath,
      method,
      headers: {
        'X-MBX-APIKEY': API_KEY || '',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.code && parsed.code < 0) {
            reject(new Error(`Binance API error: ${parsed.msg} (${parsed.code})`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Invalid response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * 현재가 조회
 */
async function getTicker(symbol) {
  return request('GET', '/api/v3/ticker/price', { symbol });
}

/**
 * 24h 변동 정보
 */
async function get24hStats(symbol) {
  return request('GET', '/api/v3/ticker/24hr', { symbol });
}

/**
 * 캔들 데이터 조회
 */
async function getCandles(symbol, interval = '1h', limit = 100) {
  const raw = await request('GET', '/api/v3/klines', { symbol, interval, limit });
  return raw.map((c) => ({
    timestamp: new Date(c[0]).toISOString(),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));
}

/**
 * 계좌 잔고 조회
 */
async function getBalance() {
  if (!isEnabled()) throw new Error('Binance API keys not configured');
  const account = await request('GET', '/api/v3/account', {}, true);
  return account.balances
    .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map((b) => ({
      currency: b.asset,
      balance: parseFloat(b.free) + parseFloat(b.locked),
      available: parseFloat(b.free),
      locked: parseFloat(b.locked),
    }));
}

/**
 * 시장가 주문
 */
async function marketOrder(symbol, side, quantity) {
  if (!isEnabled()) throw new Error('Binance API keys not configured');
  log.info({ module: 'binance', symbol, side, quantity }, 'Binance 주문 실행');
  return request('POST', '/api/v3/order', {
    symbol,
    side: side.toUpperCase(),
    type: 'MARKET',
    quantity,
  }, true);
}

/**
 * 지정가 주문
 */
async function limitOrder(symbol, side, quantity, price) {
  if (!isEnabled()) throw new Error('Binance API keys not configured');
  log.info({ module: 'binance', symbol, side, quantity, price }, 'Binance 지정가 주문');
  return request('POST', '/api/v3/order', {
    symbol,
    side: side.toUpperCase(),
    type: 'LIMIT',
    timeInForce: 'GTC',
    quantity,
    price,
  }, true);
}

/**
 * 주문 취소
 */
async function cancelOrder(symbol, orderId) {
  if (!isEnabled()) throw new Error('Binance API keys not configured');
  return request('DELETE', '/api/v3/order', { symbol, orderId }, true);
}

module.exports = {
  isEnabled,
  getTicker,
  get24hStats,
  getCandles,
  getBalance,
  marketOrder,
  limitOrder,
  cancelOrder,
};
