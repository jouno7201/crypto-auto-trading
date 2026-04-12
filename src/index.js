// 코인 자동매매 시스템 - 엔트리 포인트
// Windows 터미널 한글 깨짐 방지: stdout/stderr UTF-8 강제
if (process.platform === 'win32') {
  const { execSync } = require('child_process');
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {}
  if (process.stdout.setEncoding) process.stdout.setEncoding('utf8');
  if (process.stderr.setEncoding) process.stderr.setEncoding('utf8');
}

require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const TradingBot = require('./engine/tradingBot');
const BotManager = require('./engine/botManager');
const { streamUpbitTicker } = require('./engine/dataCollector');

const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');
const { createLogger } = require('./utils/logger');

const path = require('path');
const log = createLogger('server');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3008;

// ===== 보안 미들웨어 =====

// Helmet: 보안 HTTP 헤더 (Vite 빌드 대시보드 — CDN/인라인 필요 없음)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }),
);

// CORS: 허용 origin 제한
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : [`http://localhost:${PORT}`];

app.use(
  cors({
    origin(origin, callback) {
      // 같은 origin (대시보드) 또는 허용 목록
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS 정책에 의해 차단됨'));
      }
    },
    credentials: true,
  }),
);

// Rate Limiting: 전역 (분당 100회)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_GLOBAL || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' },
});
app.use('/api/', globalLimiter);

// ===== 요청 로깅 미들웨어 =====
let reqSeq = 0;
app.use('/api/', (req, res, next) => {
  const id = `r${++reqSeq}`;
  req.requestId = id;
  const start = Date.now();
  const { method } = req;
  const url = req.originalUrl;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    log[level]({ reqId: id, method, url, status, ms: duration }, `${method} ${url} ${status} ${duration}ms`);
  });

  next();
});

// Rate Limiting: 무거운 작업 (분당 5회)
const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_HEAVY || '5', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '백테스트/리포트 요청이 너무 많습니다. 잠시 후 다시 시도하세요.' },
});

// JSON 파싱
app.use(express.json());

// 정적 파일 (대시보드)
app.use(express.static(path.join(__dirname, 'dashboard')));

// 헬스체크 (인증 불필요)
app.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  const botSt = bot.getStatus();
  const managerSt = botManager.getPortfolioStatus();
  const wsClients = wss.clients.size;

  // 이상 감지: 봇 실행 중인데 lastTick이 3분 이상 지났으면 stale
  const lastTick = bot._lastTickAt || null;
  const stale = botSt.running && lastTick && Date.now() - lastTick > 3 * 60 * 1000;

  const healthy = !stale && bot.consecutiveErrors < 5;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heap: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    bot: {
      running: botSt.running,
      market: botSt.market,
      strategy: botSt.strategyName,
      consecutiveErrors: bot.consecutiveErrors,
      lastTick,
      stale: !!stale,
      position: !!botSt.position,
      capital: botSt.capital,
    },
    multiBots: {
      total: managerSt.totalBots,
      running: managerSt.runningBots,
    },
    ws: { clients: wsClients },
  });
});

// ===== API 라우트 =====
app.use('/api/strategies', require('./routes/strategies'));
app.use('/api/trades', require('./routes/trades'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/reports', require('./routes/reports'));

// 무거운 작업에 추가 Rate Limiting 적용
const assetsRouter = require('./routes/assets');
app.use('/api/assets/backtest/run', heavyLimiter);
app.use('/api/assets/backtest/walk-forward', heavyLimiter);
app.use('/api/reports/generate', heavyLimiter);

// 알림 테스트 API (인증 필요)
const notify = require('./engine/notifier');
app.post('/api/notify/test', async (req, res) => {
  try {
    await notify.notifyBotStart({
      market: 'KRW-BTC',
      strategy: 'ma-cross',
      mode: 'test',
      capital: 1000000,
    });
    res.json({ success: true, message: 'Discord 알림 테스트 전송 완료' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 트레이딩 봇 인스턴스 생성 (레거시 단일 봇)
const bot = new TradingBot({
  market: process.env.BOT_MARKET || 'KRW-BTC',
  strategyName: process.env.BOT_STRATEGY || 'mean-reversion',
  strategyParams: { keltnerMult: 1.8, deviationThreshold: 1.1 },
  unit: process.env.BOT_UNIT || '60',
  intervalMs: parseInt(process.env.BOT_INTERVAL || '60000', 10),
  initialCapital: parseInt(process.env.BOT_CAPITAL || '1000000', 10),
  risk: require('./engine/riskManager').REALISTIC_TARGET_PRESET,
});

// 멀티마켓 봇 매니저
const botManager = new BotManager({
  intervalMs: parseInt(process.env.BOT_INTERVAL || '60000', 10),
  initialCapital: parseInt(process.env.BOT_CAPITAL || '1000000', 10),
});

// 기본 봇 매니저에 디폴트 마켓 등록 (저장된 구성이 없을 때만)
if (botManager.bots.size === 0) {
  botManager.addBot(process.env.BOT_MARKET || 'KRW-BTC', {
    strategyName: process.env.BOT_STRATEGY || 'mean-reversion',
    strategyParams: { keltnerMult: 1.8, deviationThreshold: 1.1 },
    unit: process.env.BOT_UNIT || '60',
  });
}

// 봇 인스턴스를 라우트에 전달
require('./routes/assets').setBotInstance(bot);
require('./routes/assets').setBotManager(botManager);

// WebSocket: 실시간 시세 브로드캐스트 (멀티마켓 지원)
let broadcastMarkets = (process.env.BOT_MARKET || 'KRW-BTC').split(',');
let tickerWs = null;

function updateBroadcastMarkets() {
  const managerMarkets = botManager.getMarkets();
  if (managerMarkets.length > 0) {
    broadcastMarkets = [...new Set([...managerMarkets])];
  }
}

function startTickerStream() {
  updateBroadcastMarkets();
  tickerWs = streamUpbitTicker(broadcastMarkets, (tick) => {
    const msg = JSON.stringify({ type: 'ticker', data: tick });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(msg);
    });
  });
}

function restartTickerStream() {
  if (tickerWs) {
    try {
      tickerWs.close();
    } catch (_) {
      /* ignore */
    }
  }
  startTickerStream();
}

wss.on('connection', (ws, req) => {
  log.info('클라이언트 WebSocket 연결');

  // 연결 시 현재 봇 상태 전송 (레거시 + 멀티봇)
  ws.send(JSON.stringify({ type: 'botStatus', data: bot.getStatus() }));
  ws.send(JSON.stringify({ type: 'portfolio', data: botManager.getPortfolioStatus() }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'startBot') {
        bot.start();
      }
      if (msg.type === 'stopBot') {
        bot.stop();
      }
      if (msg.type === 'getStatus') {
        ws.send(JSON.stringify({ type: 'botStatus', data: bot.getStatus() }));
      }
      if (msg.type === 'configBot') {
        const status = bot.configure(msg.data || {});
        if (msg.data?.market && tickerWs) {
          restartTickerStream();
        }
        wss.clients.forEach((client) => {
          if (client.readyState === 1) client.send(JSON.stringify({ type: 'botStatus', data: status }));
        });
      }
      // 멀티봇 명령
      if (msg.type === 'addBot') {
        botManager.addBot(msg.data.market, msg.data);
        restartTickerStream();
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'portfolio', data: botManager.getPortfolioStatus() }));
          }
        });
      }
      if (msg.type === 'removeBot') {
        botManager.removeBot(msg.data.market);
        restartTickerStream();
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'portfolio', data: botManager.getPortfolioStatus() }));
          }
        });
      }
      if (msg.type === 'startAllBots') {
        botManager.startAll();
      }
      if (msg.type === 'stopAllBots') {
        botManager.stopAll();
      }
      if (msg.type === 'getPortfolio') {
        ws.send(JSON.stringify({ type: 'portfolio', data: botManager.getPortfolioStatus() }));
      }
    } catch (e) {
      /* ignore */
    }
  });

  ws.on('close', () => log.debug('클라이언트 WebSocket 연결 해제'));
});

// 봇 상태 주기적 브로드캐스트 (5초) — 레거시 + 멀티봇
setInterval(() => {
  const botMsg = JSON.stringify({ type: 'botStatus', data: bot.getStatus() });
  const portfolioMsg = JSON.stringify({ type: 'portfolio', data: botManager.getPortfolioStatus() });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(botMsg);
      client.send(portfolioMsg);
    }
  });
}, 5000);

// 404 및 전역 에러 핸들러 (라우트 등록 후 맨 마지막에 추가)
app.use(notFoundHandler);
app.use(globalErrorHandler);

// 미처리 예외 안전 처리
process.on('unhandledRejection', (reason) => {
  log.error({ err: reason }, '미처리 Promise 거부');
});
process.on('uncaughtException', (err) => {
  log.fatal({ err }, '미처리 예외 — 서버 종료');
  process.exit(1);
});

// Graceful shutdown (Ctrl+C)
function gracefulShutdown(signal) {
  log.info({ signal }, '종료 시그널 수신 — Graceful Shutdown');
  if (bot.running) {
    bot.stop();
  }
  botManager.stopAll();
  // Close DB connection
  try {
    require('./store/jsonStore').close();
  } catch (_) {
    /* ignore */
  }
  if (tickerWs) {
    try {
      tickerWs.close();
    } catch (_) {
      /* ignore */
    }
  }
  // WS 클라이언트에게 종료 알림 후 연결 해제
  wss.clients.forEach((client) => {
    try {
      client.send(JSON.stringify({ type: 'shutdown' }));
      client.close(1001, 'server shutdown');
    } catch (_) {
      /* ignore */
    }
  });
  server.close(() => {
    log.info('서버 종료 완료');
    process.exit(0);
  });
  // 10초 강제 종료 안전장치
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    log.info({ port: PORT }, '서버 실행 중');
    startTickerStream();
  });
}

module.exports = { app, server, wss, bot, botManager };
