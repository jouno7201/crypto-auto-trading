/**
 * 거래소 API 통합 진입점
 * - 환경변수 또는 설정에 따라 거래소 선택
 */

const upbit = require('./upbit');
const binance = require('./binance');

module.exports = { upbit, binance };
