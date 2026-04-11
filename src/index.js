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
const { authenticate, authenticateWs, generateToken } = require('./middleware/auth');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');
const { createLogger } = require('./utils/logger');

const path = require('path');
const log = createLogger('server');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3008;

// ===== 보안 미들웨어 =====

// Helmet: 보안 HTTP 헤더 (CSP는 대시보드 인라인 스크립트 허용)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        scriptSrcAttr: ["'unsafe-inline'"],
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
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 토큰 발급 엔드포인트 (API_TOKEN으로 JWT 발급)
app.post('/api/auth/token', (req, res) => {
  const { secret } = req.body;
  const apiToken = process.env.API_TOKEN;
  if (!apiToken) return res.status(501).json({ error: '인증이 설정되지 않았습니다' });
  if (secret !== apiToken) return res.status(401).json({ error: '잘못된 인증 정보' });

  try {
    const token = generateToken({ role: 'admin' }, process.env.JWT_EXPIRES || '24h');
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== API 라우트 (인증 적용) =====
app.use('/api/strategies', authenticate, require('./routes/strategies'));
app.use('/api/trades', authenticate, require('./routes/trades'));
app.use('/api/assets', authenticate, require('./routes/assets'));
app.use('/api/reports', authenticate, require('./routes/reports'));

// 무거운 작업에 추가 Rate Limiting 적용
const assetsRouter = require('./routes/assets');
app.use('/api/assets/backtest/run', authenticate, heavyLimiter);
app.use('/api/assets/backtest/walk-forward', authenticate, heavyLimiter);
app.use('/api/reports/generate', authenticate, heavyLimiter);

// 알림 테스트 API (인증 필요)
const notify = require('./engine/notifier');
app.post('/api/notify/test', authenticate, async (req, res) => {
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
  strategyName: process.env.BOT_STRATEGY || 'ma-cross',
  unit: process.env.BOT_UNIT || '60',
  intervalMs: parseInt(process.env.BOT_INTERVAL || '60000', 10),
  initialCapital: parseInt(process.env.BOT_CAPITAL || '1000000', 10),
});

// 멀티마켓 봇 매니저
const botManager = new BotManager({
  intervalMs: parseInt(process.env.BOT_INTERVAL || '60000', 10),
  initialCapital: parseInt(process.env.BOT_CAPITAL || '1000000', 10),
});

// 기본 봇 매니저에 디폴트 마켓 등록 (저장된 구성이 없을 때만)
if (botManager.bots.size === 0) {
  botManager.addBot(process.env.BOT_MARKET || 'KRW-BTC', {
    strategyName: process.env.BOT_STRATEGY || 'ma-cross',
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
  // WebSocket 인증
  const authResult = authenticateWs(req);
  if (!authResult.authenticated) {
    ws.close(4001, authResult.error);
    return;
  }

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
