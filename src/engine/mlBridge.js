/**
 * Python ML 마이크로서비스 연동
 * - HTTP로 Python ML 서비스와 통신
 * - 예측 요청/응답 처리
 *
 * Python 서비스: scripts/ml_service.py 참조
 * 설정: ML_SERVICE_URL=http://localhost:5000
 */

const http = require('http');
const log = require('../utils/logger');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000';

function isAvailable() {
  return !!process.env.ML_SERVICE_URL;
}

/**
 * ML 서비스에 HTTP POST 요청
 */
function postRequest(path, body) {
  const url = new URL(path, ML_SERVICE_URL);
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`ML service invalid response: ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', (err) => {
      log.warn({ module: 'ml-bridge', error: err.message }, 'ML 서비스 연결 실패');
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ML service timeout'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * 가격 예측 요청
 * @param {string} market - 마켓 코드 (e.g., 'KRW-BTC')
 * @param {Array} candles - 캔들 데이터 배열
 * @returns {Object} { prediction: 'buy'|'sell'|'hold', confidence: 0-1, priceTarget: number }
 */
async function predict(market, candles) {
  if (!isAvailable()) return { prediction: 'hold', confidence: 0, source: 'unavailable' };
  try {
    return await postRequest('/predict', { market, candles: candles.slice(-200) });
  } catch {
    return { prediction: 'hold', confidence: 0, source: 'error' };
  }
}

/**
 * 센티먼트 분석 요청
 * @param {string} market
 * @returns {Object} { sentiment: -1~1, sources: [...], summary: string }
 */
async function getSentiment(market) {
  if (!isAvailable()) return { sentiment: 0, sources: [], source: 'unavailable' };
  try {
    return await postRequest('/sentiment', { market });
  } catch {
    return { sentiment: 0, sources: [], source: 'error' };
  }
}

/**
 * 모델 학습 요청
 * @param {string} market
 * @param {Array} trainingData - 학습용 캔들+특성 데이터
 */
async function trainModel(market, trainingData) {
  if (!isAvailable()) throw new Error('ML service not available');
  return postRequest('/train', { market, data: trainingData });
}

module.exports = { isAvailable, predict, getSentiment, trainModel };
