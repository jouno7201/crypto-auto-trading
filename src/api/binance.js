/**
 * Binance API 래퍼 모듈
 * - REST: 시세 조회, 주문 실행
 * 공식 문서: https://binance-docs.github.io/apidocs
 */

const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = 'https://api.binance.com';

class BinanceAPI {
  constructor() {
    this.apiKey = process.env.BINANCE_API_KEY;
    this.secretKey = process.env.BINANCE_SECRET_KEY;
  }

  /**
   * HMAC SHA256 서명 생성
   */
  _sign(queryString) {
    return crypto.createHmac('sha256', this.secretKey).update(queryString).digest('hex');
  }

  /**
   * 캔들 데이터 조회 (OHLCV)
   * @param {string} symbol - 심볼 (예: BTCUSDT)
   * @param {string} interval - 1m, 5m, 15m, 1h, 4h, 1d 등
   * @param {number} limit - 캔들 수 (최대 1000)
   */
  async getCandles(symbol, interval = '1h', limit = 200) {
    const { data } = await axios.get(`${BASE_URL}/api/v3/klines`, {
      params: { symbol, interval, limit },
    });
    return data.map((c) => ({
      timestamp: new Date(c[0]).toISOString(),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  }

  /**
   * 현재가 조회
   */
  async getTicker(symbol) {
    const { data } = await axios.get(`${BASE_URL}/api/v3/ticker/price`, {
      params: { symbol },
    });
    return data;
  }

  /**
   * 계좌 조회 (인증 필요)
   */
  async getAccount() {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = this._sign(queryString);
    const { data } = await axios.get(`${BASE_URL}/api/v3/account`, {
      params: { timestamp, signature },
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });
    return data;
  }

  /**
   * 주문 실행 (인증 필요)
   * @param {string} symbol
   * @param {string} side - BUY / SELL
   * @param {string} type - MARKET / LIMIT
   * @param {object} options - { quantity, price, timeInForce }
   */
  async order(symbol, side, type, options = {}) {
    const params = {
      symbol,
      side,
      type,
      timestamp: Date.now(),
      ...options,
    };
    const queryString = new URLSearchParams(params).toString();
    params.signature = this._sign(queryString);

    const { data } = await axios.post(`${BASE_URL}/api/v3/order`, null, {
      params,
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });
    return data;
  }
}

module.exports = new BinanceAPI();
