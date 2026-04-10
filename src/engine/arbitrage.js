/**
 * 거래소 간 차익거래 전략
 * - Upbit vs Binance 가격 비교
 * - 김치 프리미엄 모니터링
 * - 차익 기회 감지
 *
 * 설정: BINANCE_API_KEY 필요
 */

const upbit = require('../api/upbit');
const binance = require('../exchange/binance');
const log = require('../utils/logger');

// 원/달러 환율 (외부 API로 대체 가능)
const DEFAULT_KRW_USD = 1350;

/**
 * 김치 프리미엄 계산
 * @param {string} upbitMarket - Upbit 마켓 (e.g., 'KRW-BTC')
 * @param {string} binanceSymbol - Binance 심볼 (e.g., 'BTCUSDT')
 * @param {number} [krwUsd] - 환율
 */
async function getKimchiPremium(upbitMarket = 'KRW-BTC', binanceSymbol = 'BTCUSDT', krwUsd = DEFAULT_KRW_USD) {
  try {
    const [upbitTicker, binanceTicker] = await Promise.all([
      upbit.getTicker(upbitMarket),
      binance.getTicker(binanceSymbol),
    ]);

    const upbitPrice = upbitTicker.trade_price || upbitTicker[0]?.trade_price;
    const binancePrice = parseFloat(binanceTicker.price);
    const binancePriceKRW = binancePrice * krwUsd;

    const premium = ((upbitPrice - binancePriceKRW) / binancePriceKRW) * 100;

    return {
      upbitPrice: Math.round(upbitPrice),
      binancePrice: parseFloat(binancePrice.toFixed(2)),
      binancePriceKRW: Math.round(binancePriceKRW),
      krwUsd,
      premium: parseFloat(premium.toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    log.warn({ module: 'arbitrage', error: err.message }, '김치 프리미엄 조회 실패');
    return { error: err.message };
  }
}

/**
 * 다중 마켓 김치 프리미엄 스캔
 */
async function scanPremiums(pairs, krwUsd = DEFAULT_KRW_USD) {
  const defaultPairs = [
    { upbit: 'KRW-BTC', binance: 'BTCUSDT' },
    { upbit: 'KRW-ETH', binance: 'ETHUSDT' },
    { upbit: 'KRW-XRP', binance: 'XRPUSDT' },
    { upbit: 'KRW-SOL', binance: 'SOLUSDT' },
    { upbit: 'KRW-DOGE', binance: 'DOGEUSDT' },
  ];

  const targets = pairs || defaultPairs;
  const results = [];

  for (const pair of targets) {
    const result = await getKimchiPremium(pair.upbit, pair.binance, krwUsd);
    results.push({ ...pair, ...result });
  }

  results.sort((a, b) => (b.premium || 0) - (a.premium || 0));

  return {
    timestamp: new Date().toISOString(),
    krwUsd,
    pairs: results,
    avgPremium: results.length > 0
      ? parseFloat((results.reduce((s, r) => s + (r.premium || 0), 0) / results.length).toFixed(2))
      : 0,
  };
}

module.exports = { getKimchiPremium, scanPremiums };
