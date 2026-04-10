/**
 * Telegram 봇 알림 모듈
 * - 매매 실행 알림
 * - 일간 리포트 알림
 * - 에러/경고 알림
 *
 * 설정: .env에 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 추가
 */

const https = require('https');
const log = require('../utils/logger');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function isEnabled() {
  return !!(BOT_TOKEN && CHAT_ID);
}

/**
 * Telegram 메시지 전송
 */
function sendMessage(text, opts = {}) {
  if (!isEnabled()) return Promise.resolve(null);

  const payload = JSON.stringify({
    chat_id: CHAT_ID,
    text,
    parse_mode: opts.parseMode || 'HTML',
    disable_web_page_preview: true,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      },
    );
    req.on('error', (err) => {
      log.warn({ module: 'telegram', error: err.message }, 'Telegram 전송 실패');
      resolve(null); // 알림 실패는 조용히 처리
    });
    req.write(payload);
    req.end();
  });
}

/**
 * 매매 실행 알림
 */
function notifyTrade(trade) {
  const emoji = trade.type === 'buy' ? '🟢' : '🔴';
  const pnlStr = trade.pnl ? `\n💰 PnL: ${trade.pnl >= 0 ? '+' : ''}${Math.round(trade.pnl).toLocaleString()}원` : '';
  const text = `${emoji} <b>${trade.type.toUpperCase()}</b> ${trade.market || ''}
📊 가격: ${Math.round(trade.price || 0).toLocaleString()}원
📦 수량: ${trade.volume || ''}${pnlStr}
🏷 전략: ${trade.strategy || 'N/A'}
📝 사유: ${trade.reason || 'N/A'}`;

  return sendMessage(text);
}

/**
 * 일간 리포트 알림
 */
function notifyDailyReport(report) {
  const s = report.summary;
  const text = `📊 <b>${report.label}</b>

📈 총 거래: ${s.totalTrades}건 (승률 ${s.winRate}%)
💰 총 PnL: ${s.totalPnl >= 0 ? '+' : ''}${s.totalPnl.toLocaleString()}원
💸 수수료: ${s.totalFees.toLocaleString()}원
📉 MDD: ${s.maxDrawdown}%
🏆 최고: +${s.bestTrade.toLocaleString()}원
💀 최저: ${s.worstTrade.toLocaleString()}원`;

  return sendMessage(text);
}

/**
 * 경고/에러 알림
 */
function notifyAlert(level, message) {
  const emoji = level === 'error' ? '🚨' : level === 'warn' ? '⚠️' : 'ℹ️';
  return sendMessage(`${emoji} <b>[${level.toUpperCase()}]</b>\n${message}`);
}

/**
 * 봇 시작/정지 알림
 */
function notifyBotStatus(action, market) {
  const emoji = action === 'start' ? '▶️' : '⏹️';
  return sendMessage(`${emoji} 봇 ${action === 'start' ? '시작' : '정지'}: <b>${market}</b>`);
}

module.exports = { isEnabled, sendMessage, notifyTrade, notifyDailyReport, notifyAlert, notifyBotStatus };
