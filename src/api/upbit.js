/**
 * Upbit API 래퍼 모듈
 * - REST: 시세 조회, 주문 실행
 * - WebSocket: 실시간 시세 스트리밍
 * 공식 문서: https://docs.upbit.com
 */

const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'https://api.upbit.com/v1';

class UpbitAPI {
  constructor() {
    this.accessKey = process.env.UPBIT_ACCESS_KEY;
    this.secretKey = process.env.UPBIT_SECRET_KEY;
  }

  /**
   * JWT 토큰 생성 (인증 필요 API용)
   */
  _createToken(queryString = '') {
    const jwt = require('jsonwebtoken');
    const payload = {
      access_key: this.accessKey,
      nonce: uuidv4(),
    };
    if (queryString) {
      const queryHash = crypto.createHash('sha512').update(queryString, 'utf-8').digest('hex');
      payload.query_hash = queryHash;
      payload.query_hash_alg = 'SHA512';
    }
    return jwt.sign(payload, this.secretKey);
  }

  /**
   * 마켓 목록 조회
   */
  async getMarkets() {
    const { data } = await axios.get(`${BASE_URL}/market/all`, {
      params: { isDetails: false },
    });
    return data;
  }

  /**
   * 캔들 데이터 조회 (OHLCV)
   * @param {string} market - 마켓 코드 (예: KRW-BTC)
   * @param {string} unit - 분 단위: 1, 3, 5, 15, 30, 60, 240
   * @param {number} count - 캔들 수 (최대 200)
   */
  async getCandles(market, unit = '60', count = 200, to = '') {
    const params = { market, count };
    if (to) params.to = to;
    const { data } = await axios.get(`${BASE_URL}/candles/minutes/${unit}`, { params });
    return data.reverse().map((c) => ({
      timestamp: c.candle_date_time_kst,
      open: c.opening_price,
      high: c.high_price,
      low: c.low_price,
      close: c.trade_price,
      volume: c.candle_acc_trade_volume,
    }));
  }

  /**
   * 일봉 캔들 조회
   */
  async getDailyCandles(market, count = 200, to = '') {
    const params = { market, count };
    if (to) params.to = to;
    const { data } = await axios.get(`${BASE_URL}/candles/days`, { params });
    return data.reverse().map((c) => ({
      timestamp: c.candle_date_time_kst,
      open: c.opening_price,
      high: c.high_price,
      low: c.low_price,
      close: c.trade_price,
      volume: c.candle_acc_trade_volume,
    }));
  }

  /**
   * 현재가 조회
   */
  async getTicker(markets) {
    const marketStr = Array.isArray(markets) ? markets.join(',') : markets;
    const { data } = await axios.get(`${BASE_URL}/ticker`, {
      params: { markets: marketStr },
    });
    return data;
  }

  /**
   * 계좌 조회 (인증 필요)
   */
  async getAccounts() {
    const token = this._createToken();
    const { data } = await axios.get(`${BASE_URL}/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }

  /**
   * 주문 실행 (인증 필요)
   * @param {string} market - 마켓 코드
   * @param {string} side - bid(매수) / ask(매도)
   * @param {string} ordType - limit(지정가) / price(시장가매수) / market(시장가매도)
   * @param {object} options - { volume, price }
   */
  async order(market, side, ordType, options = {}) {
    const params = { market, side, ord_type: ordType, ...options };
    const queryString = new URLSearchParams(params).toString();
    const token = this._createToken(queryString);
    const { data } = await axios.post(`${BASE_URL}/orders`, params, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }
}

module.exports = new UpbitAPI();
