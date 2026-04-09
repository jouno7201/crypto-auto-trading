/**
 * API 라우트 - 자산 & 봇 상태
 */
const express = require('express');
const router = express.Router();
const store = require('../store/jsonStore');
const { upbit } = require('../api');

let botInstance = null;

function setBotInstance(bot) {
  botInstance = bot;
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
  const { market, strategyName, unit } = req.body;
  const status = botInstance.configure({ market, strategyName, unit });
  res.json(status);
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

// 백테스트 실행
router.post('/backtest/run', async (req, res) => {
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
});

// 워크포워드 검증 실행
router.post('/backtest/walk-forward', async (req, res) => {
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
});

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

module.exports = router;
module.exports.setBotInstance = setBotInstance;
