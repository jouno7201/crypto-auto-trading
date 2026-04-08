// 코인 자동매매 시스템 - 엔트리 포인트
require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const TradingBot = require('./engine/tradingBot');
const { streamUpbitTicker } = require('./engine/dataCollector');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3008;

// JSON 파싱
app.use(express.json());

// 정적 파일 (대시보드)
app.use(express.static('src/dashboard'));

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// API 라우트
app.use('/api/strategies', require('./routes/strategies'));
app.use('/api/trades', require('./routes/trades'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/reports', require('./routes/reports'));

// 트레이딩 봇 인스턴스 생성
const bot = new TradingBot({
  market: process.env.BOT_MARKET || 'KRW-BTC',
  strategyName: process.env.BOT_STRATEGY || 'ma-cross',
  unit: process.env.BOT_UNIT || '60',
  intervalMs: parseInt(process.env.BOT_INTERVAL || '60000', 10),
  initialCapital: parseInt(process.env.BOT_CAPITAL || '1000000', 10),
});

// 봇 인스턴스를 라우트에 전달
require('./routes/assets').setBotInstance(bot);

// WebSocket: 실시간 시세 브로드캐스트
const broadcastMarkets = (process.env.BOT_MARKET || 'KRW-BTC').split(',');
let tickerWs = null;

function startTickerStream() {
  tickerWs = streamUpbitTicker(broadcastMarkets, (tick) => {
    const msg = JSON.stringify({ type: 'ticker', data: tick });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(msg);
    });
  });
}

wss.on('connection', (ws) => {
  console.log('[WS] 클라이언트 연결');

  // 연결 시 현재 봇 상태 전송
  ws.send(JSON.stringify({ type: 'botStatus', data: bot.getStatus() }));

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
        // 마켓 변경 시 실시간 시세 스트림도 교체
        if (msg.data?.market && tickerWs) {
          tickerWs.close();
          broadcastMarkets.length = 0;
          broadcastMarkets.push(msg.data.market);
          startTickerStream();
        }
        wss.clients.forEach((client) => {
          if (client.readyState === 1) client.send(JSON.stringify({ type: 'botStatus', data: status }));
        });
      }
    } catch (e) {
      /* ignore */
    }
  });

  ws.on('close', () => console.log('[WS] 클라이언트 연결 해제'));
});

// 봇 상태 주기적 브로드캐스트 (5초)
setInterval(() => {
  const msg = JSON.stringify({ type: 'botStatus', data: bot.getStatus() });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}, 5000);

server.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
  startTickerStream();
});

module.exports = { app, server, wss, bot };
