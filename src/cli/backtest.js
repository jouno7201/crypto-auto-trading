/**
 * CLI 백테스트 실행기
 * 사용법: node src/cli/backtest.js --strategy ma-cross --market KRW-BTC --unit 60 --count 200
 */

require('dotenv').config();

const { createStrategy, STRATEGIES } = require('../strategies');
const { runBacktest, saveResult } = require('../engine/backtest');
const { fetchUpbitCandles } = require('../engine/dataCollector');

// CLI 인자 파싱
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg, i, arr) => {
    if (arg.startsWith('--')) {
      args[arg.slice(2)] = arr[i + 1] || true;
    }
  });
  return args;
}

async function main() {
  const args = parseArgs();

  const strategyName = args.strategy || 'ma-cross';
  const market = args.market || 'KRW-BTC';
  const unit = args.unit || '60';
  const count = parseInt(args.count || '200', 10);
  const capital = parseInt(args.capital || '1000000', 10);

  console.log('═══════════════════════════════════════');
  console.log('  📊 코인 자동매매 - 백테스트 실행');
  console.log('═══════════════════════════════════════');
  console.log(`  전략: ${strategyName}`);
  console.log(`  마켓: ${market}`);
  console.log(`  단위: ${unit}분봉`);
  console.log(`  캔들 수: ${count}`);
  console.log(`  초기 자본: ${capital.toLocaleString()}원`);
  console.log('───────────────────────────────────────');

  // 사용 가능한 전략 확인
  if (!STRATEGIES[strategyName]) {
    console.error(`\n❌ 알 수 없는 전략: ${strategyName}`);
    console.log(`사용 가능한 전략: ${Object.keys(STRATEGIES).join(', ')}`);
    process.exit(1);
  }

  // 1. 데이터 수집
  console.log('\n📡 데이터 수집 중...');
  let candles;
  try {
    candles = await fetchUpbitCandles(market, unit, count);
    console.log(`   ✅ ${candles.length}개 캔들 수집 완료`);
  } catch (err) {
    console.error(`   ❌ 데이터 수집 실패: ${err.message}`);
    process.exit(1);
  }

  // 2. 전략 생성
  const strategy = createStrategy(strategyName);
  console.log(`\n🔧 전략 파라미터:`, JSON.stringify(strategy.params));

  // 3. 백테스트 실행
  console.log('\n⏳ 백테스트 실행 중...');
  const result = runBacktest(strategy, candles, { initialCapital: capital });

  // 4. 결과 출력
  console.log('\n═══════════════════════════════════════');
  console.log('  📈 백테스트 결과');
  console.log('═══════════════════════════════════════');
  console.log(`  기간: ${result.period.start} ~ ${result.period.end}`);
  console.log(`  캔들 수: ${result.period.totalCandles}`);
  console.log('───────────────────────────────────────');
  console.log(`  💰 최종 자산: ${result.performance.finalCapital.toLocaleString()}원`);
  console.log(`  📊 총 수익률: ${result.performance.totalReturn}%`);
  console.log(`  📉 최대 낙폭(MDD): ${result.performance.maxDrawdown}%`);
  console.log(`  📐 샤프 비율: ${result.performance.sharpeRatio}`);
  console.log('───────────────────────────────────────');
  console.log(`  🔄 총 거래: ${result.trades.total}회`);
  console.log(`  ✅ 승: ${result.trades.wins}회 | ❌ 패: ${result.trades.losses}회`);
  console.log(`  🎯 승률: ${result.trades.winRate}%`);
  console.log(`  💸 총 수수료: ${result.trades.totalFees.toLocaleString()}원`);
  console.log(`  📊 평균 손익: ${result.trades.avgPnl.toLocaleString()}원`);
  console.log('═══════════════════════════════════════');

  // 5. 결과 저장
  const filename = saveResult(result);
  console.log(`\n💾 결과 저장: data/${filename}`);
}

main().catch(console.error);
