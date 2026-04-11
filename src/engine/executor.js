/**
 * 주문 실행 모듈
 * - 거래소 주문 API 래핑 (시장가/지정가)
 * - 주문 상태 추적 + 폴링 (체결 확인)
 * - 부분 체결 처리
 * - 재시도 로직 (최대 3회, 지수 백오프, 에러 분류)
 * - 페이퍼 트레이딩 모드 지원
 * - Rate Limit 자동 관리 (upbit.js 내부 큐)
 */

const { upbit } = require('../api');
const store = require('../store/jsonStore');
const { createLogger } = require('../utils/logger');

const log = createLogger('executor');

const TRADING_MODE = process.env.TRADING_MODE || 'paper';

// 재시도 불가능한 에러 코드 (Upbit)
const NON_RETRYABLE = new Set([
  'insufficient_funds_bid', // 매수 잔액 부족
  'insufficient_funds_ask', // 매도 수량 부족
  'under_min_total_bid', // 최소 주문금액 미달
  'invalid_parameter', // 파라미터 오류
  'validation_error', // 유효성 오류
  'invalid_access_key', // 인증 키 오류
]);

/**
 * 에러가 재시도 가능한지 판별
 */
function isRetryable(err) {
  // Upbit 비즈니스 에러
  const code = err.response?.data?.error?.name || '';
  if (NON_RETRYABLE.has(code)) return false;
  // 네트워크/타임아웃/5xx는 재시도 가능
  if (!err.response) return true; // 네트워크 에러
  if (err.response.status >= 500) return true; // 서버 에러
  if (err.response.status === 429) return true; // Rate Limit
  return false;
}

/**
 * 주문 실행 (페이퍼/실거래 자동 분기)
 */
async function executeOrder(market, side, options = {}) {
  const order = {
    id: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    market,
    side,
    mode: TRADING_MODE,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    ...options,
  };

  // 내부 재시도 플래그 제거 (저장 시 불필요)
  delete order._retry;

  try {
    if (TRADING_MODE === 'live') {
      const result = await submitLiveOrder(market, side, options);
      order.exchangeOrderId = result.uuid;
      order.status = 'submitted';
      order.rawResult = result;

      // 주문 상태 폴링 → 체결 확인
      const filled = await pollOrderStatus(result.uuid);
      order.status = filled.status; // filled | partial_filled | cancelled
      order.executedPrice = filled.avgPrice;
      order.executedVolume = filled.executedVolume;
      order.fee = filled.paidFee;
      order.remainingVolume = filled.remainingVolume;

      if (side === 'sell' && filled.executedVolume > 0) {
        order.proceeds = filled.executedVolume * filled.avgPrice * (1 - 0.0005);
      }

      if (filled.status !== 'filled') {
        order.filledAt = null;
      } else {
        order.filledAt = new Date().toISOString();
      }
    } else {
      // 페이퍼 트레이딩: 현재가로 즉시 체결 시뮬레이션
      const ticker = await upbit.getTicker(market);
      const currentPrice = ticker[0].trade_price;
      const feeRate = 0.0005;

      if (side === 'buy') {
        const investAmount = options.price || options.amount || 0;
        const fee = investAmount * feeRate;
        const volume = (investAmount - fee) / currentPrice;
        order.executedPrice = currentPrice;
        order.executedVolume = volume;
        order.fee = fee;
      } else {
        const volume = options.volume || 0;
        const proceeds = volume * currentPrice;
        const fee = proceeds * feeRate;
        order.executedPrice = currentPrice;
        order.executedVolume = volume;
        order.proceeds = proceeds - fee;
        order.fee = fee;
      }
      order.status = 'filled';
      order.filledAt = new Date().toISOString();
    }
  } catch (err) {
    order.status = 'failed';
    order.error = err.response?.data?.error?.message || err.message;
    order.errorCode = err.response?.data?.error?.name || 'unknown';
    order.retryable = isRetryable(err);
  }

  // 주문 로그 저장
  store.append('orders.json', order);
  log.info({ mode: order.mode, side, market, status: order.status, orderId: order.id }, '주문 실행');

  return order;
}

/**
 * 실거래 주문 제출 (Upbit) — 제출만, 체결 확인은 별도
 */
async function submitLiveOrder(market, side, options = {}) {
  const upbitSide = side === 'buy' ? 'bid' : 'ask';

  if (side === 'buy') {
    return await upbit.order(market, upbitSide, 'price', {
      price: String(options.price || options.amount),
    });
  } else {
    return await upbit.order(market, upbitSide, 'market', {
      volume: String(options.volume),
    });
  }
}

/**
 * 주문 상태 폴링 (체결 대기)
 * 시장가 주문은 보통 즉시 체결되지만 부분 체결 가능성 있음
 * @param {string} uuid - Upbit 주문 UUID
 * @param {number} maxAttempts - 최대 폴링 횟수
 * @param {number} intervalMs - 폴링 간격 (ms)
 */
async function pollOrderStatus(uuid, maxAttempts = 15, intervalMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    const detail = await upbit.getOrder(uuid);
    const state = detail.state; // wait, watch, done, cancel

    if (state === 'done') {
      return parseOrderDetail(detail);
    }
    if (state === 'cancel') {
      return { ...parseOrderDetail(detail), status: 'cancelled' };
    }

    // 부분 체결 확인 (일부 체결 + 잔량 대기)
    const executed = parseFloat(detail.executed_volume || '0');
    if (executed > 0 && i >= 5) {
      // 5회(10초) 이상 대기 후에도 잔량 남으면 부분 체결로 처리
      log.warn({ uuid, executed, remaining: detail.remaining_volume }, '부분 체결 — 잔량 취소 시도');
      try {
        await upbit.cancelOrder(uuid);
      } catch (_) {
        // 취소 실패해도 계속 진행 (이미 체결되었을 수 있음)
      }
      return { ...parseOrderDetail(detail), status: 'partial_filled' };
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  // 최대 폴링 초과 → 최종 상태 한번 더 확인
  const final = await upbit.getOrder(uuid);
  if (final.state === 'done') return parseOrderDetail(final);

  log.error({ uuid }, '주문 체결 대기 시간 초과');
  return { ...parseOrderDetail(final), status: 'timeout' };
}

/**
 * Upbit 주문 상세 → 내부 포맷 변환
 */
function parseOrderDetail(detail) {
  const executedVolume = parseFloat(detail.executed_volume || '0');
  const remainingVolume = parseFloat(detail.remaining_volume || '0');
  const paidFee = parseFloat(detail.paid_fee || '0');

  // 평균 체결가 계산 (trades 합산)
  let avgPrice = 0;
  if (detail.trades && detail.trades.length > 0) {
    const totalAmount = detail.trades.reduce((s, t) => s + parseFloat(t.funds), 0);
    const totalVol = detail.trades.reduce((s, t) => s + parseFloat(t.volume), 0);
    avgPrice = totalVol > 0 ? totalAmount / totalVol : 0;
  } else if (executedVolume > 0 && detail.price) {
    // 시장가 매수의 경우 price = 총 사용 KRW
    avgPrice = parseFloat(detail.price) / executedVolume;
  }

  return {
    status: detail.state === 'done' ? 'filled' : detail.state,
    executedVolume,
    remainingVolume,
    avgPrice,
    paidFee,
    trades: detail.trades || [],
  };
}

/**
 * 주문 재시도 (최대 3회, 지수 백오프, 에러 분류)
 */
async function retryOrder(market, side, options, maxRetries = 3) {
  for (let i = 1; i <= maxRetries; i++) {
    const delay = Math.pow(2, i) * 1000;
    log.warn({ attempt: i, maxRetries, delaySec: delay / 1000 }, '주문 재시도');
    await new Promise((r) => setTimeout(r, delay));

    try {
      const result = await executeOrder(market, side, { ...options, _retry: i });
      if (result.status === 'filled' || result.status === 'submitted') return result;
      // 재시도 불가 에러면 중단
      if (result.status === 'failed' && !result.retryable) {
        log.error({ errorCode: result.errorCode }, '재시도 불가 에러 — 중단');
        return result;
      }
    } catch (e) {
      log.error({ attempt: i, err: e.message }, '주문 재시도 실패');
    }
  }
  log.error({ market, side, maxRetries }, '주문 최대 재시도 초과');
  return null;
}

/**
 * 실거래 주문 실행 + 자동 재시도 (봇용 고수준 API)
 * 실패 시 retryable 에러만 재시도
 */
async function executeWithRetry(market, side, options = {}, maxRetries = 3) {
  const result = await executeOrder(market, side, options);

  if (result.status === 'filled' || result.status === 'partial_filled') return result;
  if (result.status === 'failed' && result.retryable) {
    return retryOrder(market, side, options, maxRetries);
  }

  return result;
}

/**
 * 주문 내역 조회
 */
function getOrders(filter = {}) {
  const orders = store.load('orders.json', []);
  if (Object.keys(filter).length === 0) return orders;
  return orders.filter((o) => Object.entries(filter).every(([k, v]) => o[k] === v));
}

module.exports = { executeOrder, executeWithRetry, getOrders, TRADING_MODE };
