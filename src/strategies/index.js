/**
 * 전략 목록
 */

const BaseStrategy = require('./BaseStrategy');
const MACross = require('./MACross');
const RSIStrategy = require('./RSIStrategy');
const BollingerBand = require('./BollingerBand');
const VolatilityBreakout = require('./VolatilityBreakout');
const MACDStrategy = require('./MACDStrategy');
const TripleEMA = require('./TripleEMA');
const ComboSignal = require('./ComboSignal');
const MeanReversion = require('./MeanReversion');
const AdaptiveMomentum = require('./AdaptiveMomentum');

// 전략 이름 → 클래스 매핑 (별칭 포함)
const STRATEGIES = {
  'ma-cross': MACross,
  rsi: RSIStrategy,
  bollinger: BollingerBand,
  'bollinger-band': BollingerBand,
  volatility: VolatilityBreakout,
  'volatility-breakout': VolatilityBreakout,
  macd: MACDStrategy,
  'triple-ema': TripleEMA,
  combo: ComboSignal,
  'combo-signal': ComboSignal,
  'mean-reversion': MeanReversion,
  'adaptive-momentum': AdaptiveMomentum,
};

/**
 * 전략 이름으로 인스턴스 생성
 */
function createStrategy(name, params = {}) {
  const StrategyClass = STRATEGIES[name];
  if (!StrategyClass) throw new Error(`알 수 없는 전략: ${name}`);
  return new StrategyClass(params);
}

module.exports = {
  BaseStrategy,
  MACross,
  RSIStrategy,
  BollingerBand,
  VolatilityBreakout,
  MACDStrategy,
  TripleEMA,
  ComboSignal,
  MeanReversion,
  AdaptiveMomentum,
  STRATEGIES,
  createStrategy,
};
