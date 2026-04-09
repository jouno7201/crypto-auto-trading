/**
 * API Rate Limiter — 토큰 버킷 + 요청 큐
 * Upbit 제한: 주문 API 초당 8회, 조회 API 초당 30회
 */

const { createLogger } = require('./logger');
const log = createLogger('rate-limit');

class RateLimiter {
  /**
   * @param {number} maxTokens - 버킷 최대 토큰 수
   * @param {number} refillRate - 초당 토큰 보충 수
   */
  constructor(maxTokens, refillRate) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
    this.queue = [];
    this.processing = false;
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  /**
   * 큐에 요청 추가 후 순서대로 실행
   * @param {Function} fn - 실행할 async 함수
   * @returns {Promise}
   */
  schedule(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._process();
    });
  }

  async _process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      this._refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        const { fn, resolve, reject } = this.queue.shift();
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        }
      } else {
        // 다음 토큰까지 대기
        const waitMs = Math.ceil(((1 - this.tokens) / this.refillRate) * 1000);
        log.debug({ waitMs, queueSize: this.queue.length }, 'rate limit 대기');
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }

    this.processing = false;
  }
}

// 싱글턴: 주문용 / 조회용 분리
const orderLimiter = new RateLimiter(8, 8); // 초당 8회
const queryLimiter = new RateLimiter(25, 25); // 초당 25회 (여유분 확보)

module.exports = { RateLimiter, orderLimiter, queryLimiter };
