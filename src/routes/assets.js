/**
 * API 라우트 - 자산 & 봇 상태 (멀티마켓 지원)
 */
const express = require('express');
const router = express.Router();
const store = require('../store/jsonStore');
const { upbit } = require('../api');

let botInstance = null;
let botManagerInstance = null;

function setBotInstance(bot) {
  botInstance = bot;
}

function setBotManager(manager) {
  botManagerInstance = manager;
}

// === 백테스트 동시 실행 제한 (세마포어) ===
const BT_MAX_CONCURRENT = 2;
const BT_TIMEOUT_MS = 5 * 60 * 1000; // 5분
let btRunning = 0;

function btAcquire() {
  if (btRunning >= BT_MAX_CONCURRENT) return false;
  btRunning++;
  return true;
}

function btRelease() {
  btRunning = Math.max(0, btRunning - 1);
}

function withBtLimit(handler) {
  return async (req, res) => {
    if (!btAcquire()) {
      return res.status(429).json({
        error: `백테스트가 이미 ${BT_MAX_CONCURRENT}개 실행 중입니다. 잠시 후 다시 시도하세요.`,
        running: btRunning,
      });
    }
    const timer = setTimeout(() => {
      btRelease();
    }, BT_TIMEOUT_MS);
    try {
      await handler(req, res);
    } finally {
      clearTimeout(timer);
      btRelease();
    }
  };
}

// 자산 현황
router.get('/', async (req, res) => {
  try {
    if (botInstance) {
      const status = botInstance.getStatus();
      const currentPrice = await getCurrentPrice(status.market);
      const positionValue = status.position ? status.position.volume * currentPrice : 0;
      const totalAssets = status.capital + positionValue;
      const pnl = status.position
        ? (((currentPrice - status.position.entryPrice) / status.position.entryPrice) * 100).toFixed(2)
        : 0;

      return res.json({
        capital: Math.round(status.capital),
        positionValue: Math.round(positionValue),
        totalAssets: Math.round(totalAssets),
        position: status.position
          ? {
              ...status.position,
              currentPrice,
              unrealizedPnl: Math.round(positionValue - status.position.volume * status.position.entryPrice),
              unrealizedPnlPercent: parseFloat(pnl),
            }
          : null,
        tradeCount: status.tradeCount,
        mode: status.mode,
        botRunning: status.running,
      });
    }

    // 봇 미실행 시 저장된 상태 반환
    const state = store.load('bot-state.json', {});
    res.json({ ...state, botRunning: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 봇 상태 조회
router.get('/bot', (req, res) => {
  if (!botInstance) return res.json({ running: false });
  res.json(botInstance.getStatus());
});

// 봇 시작
router.post('/bot/start', (req, res) => {
  if (!botInstance) return res.status(400).json({ error: '봇 인스턴스 없음' });
  botInstance.start();
  res.json({ status: 'started' });
});

// 봇 정지
router.post('/bot/stop', (req, res) => {
  if (!botInstance) return res.status(400).json({ error: '봇 인스턴스 없음' });
  botInstance.stop();
  res.json({ status: 'stopped' });
});

// 봇 설정 변경 (마켓, 전략, 캔들 단위)
router.post('/bot/configure', (req, res) => {
  if (!botInstance) return res.status(400).json({ error: '봇 인스턴스 없음' });
  const { market, strategyName, strategyParams, unit } = req.body;
  try {
    const status = botInstance.configure({ market, strategyName, strategyParams, unit });
    res.json(status);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// 백테스트 결과 목록
router.get('/backtest', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(store.DATA_DIR, 'backtest-results');
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const results = files.map((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    return {
      file: f,
      strategy: data.strategy,
      totalReturn: data.performance?.totalReturn,
      maxDrawdown: data.performance?.maxDrawdown,
      winRate: data.trades?.winRate,
      totalTrades: data.trades?.total,
      period: data.period,
    };
  });
  res.json(results);
});

// 백테스트 실행 (동시 실행 제한)
router.post(
  '/backtest/run',
  withBtLimit(async (req, res) => {
    try {
      const {
        strategy,
        market = 'KRW-BTC',
        unit = '60',
        count,
        capital = 1000000,
        params = {},
        startDate,
        endDate,
        riskPerTrade,
        stopLossATR,
        takeProfitATR,
        trailingStopATR,
        allowShort,
        useMarketDetector,
      } = req.body;
      if (!strategy) return res.status(400).json({ error: '전략을 선택하세요' });

      const { createStrategy } = require('../strategies');
      const { fetchUpbitCandles, fetchUpbitCandlesByRange } = require('../engine/dataCollector');
      const { runBacktest, saveResult } = require('../engine/backtest');

      const strat = createStrategy(strategy, params);

      let candles;
      if (startDate && endDate) {
        candles = await fetchUpbitCandlesByRange(market, unit, startDate, endDate);
      } else {
        candles = await fetchUpbitCandles(market, unit, count || 200);
      }

      const btOptions = { initialCapital: capital };
      if (riskPerTrade !== undefined) btOptions.riskPerTrade = riskPerTrade;
      if (stopLossATR !== undefined) btOptions.stopLossATR = stopLossATR;
      if (takeProfitATR !== undefined) btOptions.takeProfitATR = takeProfitATR;
      if (trailingStopATR !== undefined) btOptions.trailingStopATR = trailingStopATR;
      if (allowShort !== undefined) btOptions.allowShort = allowShort;
      if (useMarketDetector !== undefined) btOptions.useMarketDetector = useMarketDetector;

      const result = runBacktest(strat, candles, btOptions);
      const file = saveResult(result);

      res.json({ ...result, file });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }),
);

// 워크포워드 검증 실행 (동시 실행 제한)
router.post(
  '/backtest/walk-forward',
  withBtLimit(async (req, res) => {
    try {
      const {
        strategy,
        market = 'KRW-BTC',
        unit = '60',
        startDate,
        endDate,
        capital = 1000000,
        windows = 4,
        trainRatio = 0.7,
        allowShort = false,
        useMarketDetector = true,
        optimizeStrategy = false,
        metric = 'calmar',
      } = req.body;
      if (!strategy) return res.status(400).json({ error: '전략을 선택하세요' });
      if (!startDate || !endDate) return res.status(400).json({ error: '시작일/종료일을 입력하세요' });

      const { createStrategy } = require('../strategies');
      const { fetchUpbitCandlesByRange } = require('../engine/dataCollector');
      const { runWalkForward } = require('../engine/walkForward');

      const candles = await fetchUpbitCandlesByRange(market, unit, startDate, endDate);

      const result = runWalkForward(createStrategy, strategy, candles, {
        windows,
        trainRatio,
        initialCapital: capital,
        allowShort,
        useMarketDetector,
        optimizeStrategy,
        metric,
      });

      // 결과 저장
      const filename = `walkforward_${strategy}_${Date.now()}.json`;
      store.save(`backtest-results/${filename}`, result);

      res.json({ ...result, file: filename });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }),
);

// 백테스트 결과 상세
router.get('/backtest/:file', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(store.DATA_DIR, 'backtest-results', req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '결과 없음' });
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  res.json(data);
});

// 캔들 데이터 조회
router.get('/candles/:market', async (req, res) => {
  try {
    const { market } = req.params;
    const unit = req.query.unit || '60';
    const count = parseInt(req.query.count || '200', 10);
    const { fetchUpbitCandles } = require('../engine/dataCollector');
    const candles = await fetchUpbitCandles(market, unit, count);
    res.json(candles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getCurrentPrice(market) {
  try {
    const ticker = await upbit.getTicker(market);
    return ticker[0].trade_price;
  } catch {
    return 0;
  }
}

// ===== 멀티마켓 봇 관리 API =====

// 포트폴리오 전체 상태
router.get('/portfolio', (req, res) => {
  if (!botManagerInstance) return res.json({ error: '멀티봇 매니저 미설정' });
  res.json(botManagerInstance.getPortfolioStatus());
});

// 등록된 전체 봇 목록
router.get('/bots', (req, res) => {
  if (!botManagerInstance) return res.json({ bots: [] });
  res.json(botManagerInstance.getAllStatus());
});

// 봇 추가 (마켓별)
router.post('/bots/add', (req, res) => {
  if (!botManagerInstance) return res.status(400).json({ error: '멀티봇 매니저 미설정' });
  const { market, strategyName, unit, initialCapital } = req.body;
  if (!market) return res.status(400).json({ error: '마켓을 지정하세요' });
  const bot = botManagerInstance.addBot(market, { strategyName, unit, initialCapital });
  res.json(bot.getStatus());
});

// 봇 제거
router.delete('/bots/:market', (req, res) => {
  if (!botManagerInstance) return res.status(400).json({ error: '멀티봇 매니저 미설정' });
  const removed = botManagerInstance.removeBot(req.params.market);
  res.json({ removed, market: req.params.market });
});

// 특정 마켓 봇 상태
router.get('/bots/:market', (req, res) => {
  if (!botManagerInstance) return res.status(400).json({ error: '멀티봇 매니저 미설정' });
  const bot = botManagerInstance.getBot(req.params.market);
  if (!bot) return res.status(404).json({ error: '해당 마켓 봇 없음' });
  res.json(bot.getStatus());
});

// 특정 마켓 봇 시작
router.post('/bots/:market/start', (req, res) => {
  if (!botManagerInstance) return res.status(400).json({ error: '멀티봇 매니저 미설정' });
  const ok = botManagerInstance.startBot(req.params.market);
  if (!ok) return res.status(404).json({ error: '해당 마켓 봇 없음' });
  res.json({ status: 'started', market: req.params.market });
});

// 특정 마켓 봇 정지
router.post('/bots/:market/stop', (req, res) => {
  if (!botManagerInstance) return res.status(400).json({ error: '멀티봇 매니저 미설정' });
  const ok = botManagerInstance.stopBot(req.params.market);
  if (!ok) return res.status(404).json({ error: '해당 마켓 봇 없음' });
  res.json({ status: 'stopped', market: req.params.market });
});

// 전체 봇 시작
router.post('/bots/start-all', (req, res) => {
  if (!botManagerInstance) return res.status(400).json({ error: '멀티봇 매니저 미설정' });
  botManagerInstance.startAll();
  res.json({ status: 'all-started', markets: botManagerInstance.getMarkets() });
});

// 전체 봇 정지
router.post('/bots/stop-all', (req, res) => {
  if (!botManagerInstance) return res.status(400).json({ error: '멀티봇 매니저 미설정' });
  botManagerInstance.stopAll();
  res.json({ status: 'all-stopped' });
});

// 특정 마켓 봇 설정 변경
router.post('/bots/:market/configure', (req, res) => {
  if (!botManagerInstance) return res.status(400).json({ error: '멀티봇 매니저 미설정' });
  const { strategyName, strategyParams, unit } = req.body;
  const status = botManagerInstance.configureBot(req.params.market, { strategyName, strategyParams, unit });
  if (!status) return res.status(404).json({ error: '해당 마켓 봇 없음' });
  res.json(status);
});

// ===== 마켓 분석 API =====

// 마켓 간 상관관계 분석
router.post('/analysis/correlation', async (req, res) => {
  try {
    const { markets, unit = '60', count = 500 } = req.body;
    if (!markets || markets.length < 2) {
      return res.status(400).json({ error: '2개 이상의 마켓을 지정하세요' });
    }
    const { calculateCorrelationMatrix } = require('../engine/correlationAnalyzer');
    const result = await calculateCorrelationMatrix(markets, { unit, count });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 포트폴리오 추천
router.post('/analysis/recommend-portfolio', async (req, res) => {
  try {
    const { markets, maxMarkets = 4, unit = '60', count = 500 } = req.body;
    if (!markets || markets.length < 2) {
      return res.status(400).json({ error: '2개 이상의 후보 마켓을 지정하세요' });
    }
    const { recommendPortfolio } = require('../engine/correlationAnalyzer');
    const result = await recommendPortfolio(markets, { maxMarkets, unit, count });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 마켓별 최적 전략 매칭
router.post('/analysis/match-strategy', async (req, res) => {
  try {
    const { market, unit = '60', count = 500 } = req.body;
    if (!market) return res.status(400).json({ error: '마켓을 지정하세요' });
    const { matchStrategiesForMarket } = require('../engine/strategyMatcher');
    const result = await matchStrategiesForMarket(market, { unit, count });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 다수 마켓 전략 일괄 매칭
router.post('/analysis/match-all', async (req, res) => {
  try {
    const { markets, unit = '60', count = 500 } = req.body;
    if (!markets || markets.length === 0) {
      return res.status(400).json({ error: '마켓 목록을 지정하세요' });
    }
    const { matchAllMarkets } = require('../engine/strategyMatcher');
    const result = await matchAllMarkets(markets, { unit, count });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === 고급 분석 API ===
const advancedAnalysis = require('../engine/advancedAnalysis');

// 몬테카를로 시뮬레이션
router.post('/analysis/monte-carlo', (req, res) => {
  try {
    const result = advancedAnalysis.monteCarlo(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 고급 성과 지표 (Sortino, Calmar 등)
router.get('/analysis/metrics', (req, res) => {
  try {
    const result = advancedAnalysis.advancedMetrics(req.query || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 드로다운 분석
router.get('/analysis/drawdown', (req, res) => {
  try {
    const opts = { ...req.query };
    if (opts.topN) opts.topN = parseInt(opts.topN, 10);
    if (opts.initialCapital) opts.initialCapital = parseInt(opts.initialCapital, 10);
    const result = advancedAnalysis.drawdownAnalysis(opts);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 벤치마크 비교
router.get('/analysis/benchmark', (req, res) => {
  try {
    const result = advancedAnalysis.benchmarkComparison(req.query || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.setBotInstance = setBotInstance;
module.exports.setBotManager = setBotManager;
