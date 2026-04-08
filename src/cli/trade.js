/**
 * CLI 트레이딩 봇 실행기
 * 사용법: node src/cli/trade.js --strategy ma-cross --market KRW-BTC --unit 60 --interval 60 --capital 1000000
 */

require('dotenv').config();

const TradingBot = require('../engine/tradingBot');

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg, i, arr) => {
    if (arg.startsWith('--')) {
      args[arg.slice(2)] = arr[i + 1] || true;
    }
  });
  return args;
}

const args = parseArgs();

const bot = new TradingBot({
  market: args.market || 'KRW-BTC',
  strategyName: args.strategy || 'ma-cross',
  unit: args.unit || '60',
  candleCount: parseInt(args.count || '200', 10),
  intervalMs: parseInt(args.interval || '60', 10) * 1000,
  initialCapital: parseInt(args.capital || '1000000', 10),
  risk: {
    stopLossPercent: parseFloat(args['stop-loss'] || '3'),
    takeProfitPercent: parseFloat(args['take-profit'] || '5'),
    maxPositionRatio: parseFloat(args['max-position'] || '0.3'),
  },
});

// 종료 핸들링
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Ctrl+C 감지 - 봇 종료 중...');
  bot.stop();
  const status = bot.getStatus();
  console.log(`\n📊 최종 상태:`);
  console.log(`  자본: ${status.capital.toLocaleString()}원`);
  console.log(`  거래 횟수: ${status.tradeCount}회`);
  console.log(`  포지션: ${status.position ? '보유 중' : '없음'}`);
  process.exit(0);
});

bot.start();
