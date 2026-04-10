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
const EnsembleStrategy = require('./EnsembleStrategy');

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
  ensemble: EnsembleStrategy,
};

// 워크포워드 검증 결과 기반 추천 전략
// WF 분석 기반: MACD만 OOS 수익 (나머지 모두 손실)
const RECOMMENDED = ['macd'];
const DEPRECATED = ['volatility-breakout', 'triple-ema', 'adaptive-momentum']; // OOS 대폭 손실

/**
 * 전략 이름으로 인스턴스 생성
 */
function createStrategy(name, params = {}) {
  const StrategyClass = STRATEGIES[name];
  if (!StrategyClass) throw new Error(`알 수 없는 전략: ${name}`);
  if (DEPRECATED.includes(name)) {
    console.warn(`⚠️  전략 '${name}'은(는) WF 분석에서 OOS 대폭 손실. MACD 사용 권장.`);
  }
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
  EnsembleStrategy,
  STRATEGIES,
  RECOMMENDED,
  DEPRECATED,
  createStrategy,
};
