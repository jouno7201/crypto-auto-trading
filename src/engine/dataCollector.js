/**
 * 시세 데이터 수집기
 * - REST API로 과거 캔들 데이터 수집 (OHLCV)
 * - WebSocket으로 실시간 시세 스트리밍
 * - 수집 데이터 JSON 파일 저장 및 메모리 캐싱
 */

const WebSocket = require('ws');
const { upbit, binance } = require('../api');
const store = require('../store/jsonStore');

// 메모리 캐시: { "KRW-BTC_60": [...candles] }
const cache = new Map();

/**
 * Upbit 과거 캔들 데이터 수집 및 저장
 * @param {string} market - 마켓 코드 (예: KRW-BTC)
 * @param {string} unit - 분 단위 ('1','5','15','60','240') 또는 'day'
 * @param {number} count - 캔들 수
 */
async function fetchUpbitCandles(market, unit = '60', count = 200) {
  let candles;
  if (unit === 'day') {
    candles = await upbit.getDailyCandles(market, count);
  } else {
    candles = await upbit.getCandles(market, unit, count);
  }

  // 메모리 캐시 저장
  const cacheKey = `${market}_${unit}`;
  cache.set(cacheKey, candles);

  // JSON 파일 저장
  store.save(`candles/${market}_${unit}.json`, candles);

  console.log(`[수집] ${market} ${unit}분봉 ${candles.length}개 저장 완료`);
  return candles;
}

/**
 * Binance 과거 캔들 데이터 수집 및 저장
 */
async function fetchBinanceCandles(symbol, interval = '1h', limit = 200) {
  const candles = await binance.getCandles(symbol, interval, limit);

  const cacheKey = `${symbol}_${interval}`;
  cache.set(cacheKey, candles);

  store.save(`candles/${symbol}_${interval}.json`, candles);

  console.log(`[수집] ${symbol} ${interval} ${candles.length}개 저장 완료`);
  return candles;
}

/**
 * 캐시에서 캔들 데이터 조회 (없으면 파일에서 로드)
 */
function getCandles(key) {
  if (cache.has(key)) return cache.get(key);
  const filename = `candles/${key}.json`;
  const data = store.load(filename, null);
  if (data) cache.set(key, data);
  return data;
}

/**
 * Upbit WebSocket 실시간 시세 스트리밍
 * @param {string[]} markets - 마켓 코드 배열
 * @param {function} onTick - 틱 데이터 콜백
 * @returns {WebSocket}
 */
function streamUpbitTicker(markets, onTick) {
  const ws = new WebSocket('wss://api.upbit.com/websocket/v1');

  ws.on('open', () => {
    const payload = [{ ticket: `ticker-${Date.now()}` }, { type: 'ticker', codes: markets }];
    ws.send(JSON.stringify(payload));
    console.log(`[WS] Upbit 실시간 시세 구독: ${markets.join(', ')}`);
  });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const tick = {
        market: data.code,
        price: data.trade_price,
        volume: data.trade_volume,
        change: data.signed_change_rate,
        timestamp: data.trade_timestamp,
      };
      onTick(tick);
    } catch (e) {
      // 바이너리 데이터 등 무시
    }
  });

  ws.on('error', (err) => console.error('[WS] Upbit 에러:', err.message));
  ws.on('close', () => console.log('[WS] Upbit 연결 종료'));

  return ws;
}

/**
 * Upbit 기간 기반 캔들 데이터 수집 (페이지네이션)
 * @param {string} market - 마켓 코드
 * @param {string} unit - 분 단위 또는 'day'
 * @param {string} startDate - 시작일 (YYYY-MM-DD)
 * @param {string} endDate - 종료일 (YYYY-MM-DD)
 */
async function fetchUpbitCandlesByRange(market, unit, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59);

  // Upbit to 포맷: yyyy-MM-ddTHH:mm:ss (KST 기준, 타임존/밀리초 없이)
  function toUpbitFormat(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${dd}T${hh}:${mm}:${ss}`;
  }

  let allCandles = [];
  let to = toUpbitFormat(end);
  const PAGE = 200;
  const MAX_PAGES = 50;

  for (let page = 0; page < MAX_PAGES; page++) {
    let candles;
    if (unit === 'day') {
      candles = await upbit.getDailyCandles(market, PAGE, to);
    } else {
      candles = await upbit.getCandles(market, unit, PAGE, to);
    }
    if (!candles.length) break;

    // startDate 이전 캔들은 제외
    const filtered = candles.filter((c) => new Date(c.timestamp) >= start);
    allCandles = filtered.concat(allCandles);

    // 가장 오래된 캔들이 startDate 이전이면 완료
    const oldest = new Date(candles[0].timestamp);
    if (oldest <= start) break;

    // 다음 페이지: 가장 오래된 캔들 이전으로 이동
    to = candles[0].timestamp.replace(' ', 'T').slice(0, 19);

    // Upbit API rate limit 방지 (100ms 간격)
    await new Promise((r) => setTimeout(r, 100));
  }

  // 중복 제거 (timestamp 기준)
  const seen = new Set();
  allCandles = allCandles.filter((c) => {
    if (seen.has(c.timestamp)) return false;
    seen.add(c.timestamp);
    return true;
  });

  console.log(`[수집] ${market} ${unit} ${startDate}~${endDate} → ${allCandles.length}개 캔들`);
  return allCandles;
}

module.exports = {
  fetchUpbitCandles,
  fetchUpbitCandlesByRange,
  fetchBinanceCandles,
  getCandles,
  streamUpbitTicker,
  cache,
};
