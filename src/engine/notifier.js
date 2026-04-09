/**
 * Discord 웹훅 알림 모듈
 * - 매수/매도 체결 알림
 * - 봇 시작/정지 알림
 * - 에러 알림
 * - 일일 리포트
 */

const https = require('https');
const url = require('url');

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

/**
 * Discord 웹훅으로 메시지 전송
 */
function sendWebhook(payload) {
  if (!WEBHOOK_URL) return Promise.resolve();

  return new Promise((resolve) => {
    try {
      const parsed = new URL(WEBHOOK_URL);
      // Discord webhook URL 형식 검증
      if (!parsed.hostname.endsWith('discord.com') || !parsed.pathname.startsWith('/api/webhooks/')) {
        console.error('[알림] 유효하지 않은 Discord 웹훅 URL');
        return resolve();
      }

      const body = JSON.stringify(payload);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', (err) => {
        console.error(`[알림] Discord 전송 실패: ${err.message}`);
        resolve();
      });

      req.setTimeout(5000, () => {
        req.destroy();
        resolve();
      });

      req.write(body);
      req.end();
    } catch (err) {
      console.error(`[알림] Discord 전송 에러: ${err.message}`);
      resolve();
    }
  });
}

/**
 * 매수 체결 알림
 */
function notifyBuy({ market, price, amount, reason, strategy, stopLoss, takeProfit }) {
  return sendWebhook({
    embeds: [
      {
        title: '🟢 매수 체결',
        color: 0x00d26a,
        fields: [
          { name: '마켓', value: market, inline: true },
          { name: '전략', value: strategy || '-', inline: true },
          { name: '사유', value: reason || '-', inline: false },
          { name: '매수가', value: `${Number(price).toLocaleString()}원`, inline: true },
          { name: '투자금', value: `${Number(amount).toLocaleString()}원`, inline: true },
          ...(stopLoss ? [{ name: '손절가', value: `${Number(stopLoss).toLocaleString()}원`, inline: true }] : []),
          ...(takeProfit ? [{ name: '익절가', value: `${Number(takeProfit).toLocaleString()}원`, inline: true }] : []),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/**
 * 매도 체결 알림
 */
function notifySell({ market, entryPrice, exitPrice, pnl, pnlPercent, reason, strategy }) {
  const isProfit = pnl >= 0;
  return sendWebhook({
    embeds: [
      {
        title: isProfit ? '📈 매도 체결 (수익)' : '📉 매도 체결 (손실)',
        color: isProfit ? 0x00d26a : 0xf93a37,
        fields: [
          { name: '마켓', value: market, inline: true },
          { name: '전략', value: strategy || '-', inline: true },
          { name: '사유', value: reason || '-', inline: false },
          { name: '진입가', value: `${Number(entryPrice).toLocaleString()}원`, inline: true },
          { name: '청산가', value: `${Number(exitPrice).toLocaleString()}원`, inline: true },
          {
            name: '손익',
            value: `${isProfit ? '+' : ''}${Number(pnl).toLocaleString()}원 (${pnlPercent}%)`,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/**
 * 봇 시작 알림
 */
function notifyBotStart({ market, strategy, mode, capital }) {
  return sendWebhook({
    embeds: [
      {
        title: '🤖 트레이딩 봇 시작',
        color: 0x5865f2,
        fields: [
          { name: '마켓', value: market, inline: true },
          { name: '전략', value: strategy, inline: true },
          { name: '모드', value: mode.toUpperCase(), inline: true },
          { name: '자본', value: `${Number(capital).toLocaleString()}원`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/**
 * 봇 정지 알림
 */
function notifyBotStop({ market, capital, tradeCount }) {
  return sendWebhook({
    embeds: [
      {
        title: '⏹️ 트레이딩 봇 정지',
        color: 0x99aab5,
        fields: [
          { name: '마켓', value: market, inline: true },
          { name: '잔액', value: `${Number(capital).toLocaleString()}원`, inline: true },
          { name: '거래수', value: `${tradeCount}회`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/**
 * 에러 알림
 */
function notifyError({ context, message }) {
  return sendWebhook({
    embeds: [
      {
        title: '🚨 에러 발생',
        color: 0xf93a37,
        fields: [
          { name: '위치', value: context || 'unknown', inline: true },
          { name: '내용', value: message.slice(0, 1000), inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/**
 * 일일 리포트 알림
 */
function notifyDailyReport({ market, capital, initialCapital, todayPnl, todayTrades, position }) {
  const totalReturn = (((capital - initialCapital) / initialCapital) * 100).toFixed(2);
  const todayReturn = todayPnl != null ? `${todayPnl >= 0 ? '+' : ''}${Number(todayPnl).toLocaleString()}원` : '-';
  const posStatus = position ? `보유 (진입: ${Number(position.entryPrice).toLocaleString()}원)` : '미보유';

  return sendWebhook({
    embeds: [
      {
        title: '📊 일일 리포트',
        color: 0x5865f2,
        fields: [
          { name: '마켓', value: market, inline: true },
          { name: '포지션', value: posStatus, inline: true },
          { name: '오늘 거래', value: `${todayTrades || 0}회`, inline: true },
          { name: '오늘 손익', value: todayReturn, inline: true },
          { name: '총 자산', value: `${Number(capital).toLocaleString()}원`, inline: true },
          { name: '총 수익률', value: `${totalReturn}%`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

module.exports = {
  notifyBuy,
  notifySell,
  notifyBotStart,
  notifyBotStop,
  notifyError,
  notifyDailyReport,
};
