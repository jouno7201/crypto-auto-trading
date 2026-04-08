/**
 * 주문 실행 모듈
 * - 거래소 주문 API 래핑 (시장가/지정가)
 * - 주문 상태 추적
 * - 재시도 로직 (최대 3회, 지수 백오프)
 * - 페이퍼 트레이딩 모드 지원
 */

const { upbit } = require('../api');
const store = require('../store/jsonStore');

const TRADING_MODE = process.env.TRADING_MODE || 'paper';

/**
 * 주문 실행 (페이퍼/실거래 자동 분기)
 * @param {string} market - 마켓 코드 (예: KRW-BTC)
 * @param {string} side - 'buy' 또는 'sell'
 * @param {object} options - { price, volume, ordType }
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

  try {
    if (TRADING_MODE === 'live') {
      const result = await executeLiveOrder(market, side, options);
      order.exchangeOrderId = result.uuid;
      order.status = 'submitted';
      order.result = result;
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
    order.error = err.message;
    // 재시도 로직
    if (!options._retryCount) {
      order.retryResult = await retryOrder(market, side, options);
    }
  }

  // 주문 로그 저장
  store.append('orders.json', order);
  console.log(
    `[주문] ${order.mode === 'live' ? '실거래' : '페이퍼'} | ${side.toUpperCase()} ${market} | 상태: ${order.status}`,
  );

  return order;
}

/**
 * 실거래 주문 실행 (Upbit)
 */
async function executeLiveOrder(market, side, options = {}) {
  const upbitSide = side === 'buy' ? 'bid' : 'ask';

  if (side === 'buy') {
    // 시장가 매수: price = 투자금액(KRW)
    return await upbit.order(market, upbitSide, 'price', {
      price: String(options.price || options.amount),
    });
  } else {
    // 시장가 매도: volume = 매도수량
    return await upbit.order(market, upbitSide, 'market', {
      volume: String(options.volume),
    });
  }
}

/**
 * 주문 재시도 (최대 3회, 지수 백오프)
 */
async function retryOrder(market, side, options, maxRetries = 3) {
  for (let i = 1; i <= maxRetries; i++) {
    const delay = Math.pow(2, i) * 1000; // 2초, 4초, 8초
    console.log(`[주문] 재시도 ${i}/${maxRetries} (${delay / 1000}초 후)`);
    await new Promise((r) => setTimeout(r, delay));

    try {
      const result = await executeOrder(market, side, { ...options, _retryCount: i });
      if (result.status === 'filled' || result.status === 'submitted') return result;
    } catch (e) {
      console.error(`[주문] 재시도 ${i} 실패: ${e.message}`);
    }
  }
  console.error(`[주문] 최대 재시도 초과. 주문 실패.`);
  return null;
}

/**
 * 주문 내역 조회
 */
function getOrders(filter = {}) {
  const orders = store.load('orders.json', []);
  if (Object.keys(filter).length === 0) return orders;
  return orders.filter((o) => Object.entries(filter).every(([k, v]) => o[k] === v));
}

module.exports = { executeOrder, getOrders, TRADING_MODE };
