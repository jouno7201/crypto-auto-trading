/**
 * 워크포워드 재검증 스크립트
 * 최근 3개월 (2026-01 ~ 2026-04) 데이터로 ensemble 전략 멀티마켓 검증
 */

const http = require('http');

const BASE = 'http://localhost:3008';
const MARKETS = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP'];
const STRATEGY = 'ensemble';

const COMMON_PARAMS = {
  unit: '60',
  startDate: '2026-01-01',
  endDate: '2026-04-12',
  capital: 1000000,
  windows: 4,
  trainRatio: 0.7,
  allowShort: false,
  useMarketDetector: true,
  optimizeStrategy: true,
  metric: 'calmar',
};

function postJSON(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = http.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(chunks));
        } catch {
          reject(new Error(`JSON parse error: ${chunks.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(600000, () => {
      req.destroy(new Error('Request timeout (10min)'));
    });
    req.write(body);
    req.end();
  });
}

function printSummary(name, result) {
  console.log('\n' + '='.repeat(60));
  console.log(`📊 ${name.toUpperCase()} 워크포워드 결과`);
  console.log('='.repeat(60));

  if (result.error) {
    console.log(`❌ 에러: ${result.error}`);
    return;
  }

  // API returns data at top level (not under .summary)
  const oos = result.oos || {};
  const analysis = result.analysis || {};

  console.log(`\n[OOS 성과]`);
  console.log(`  평균 수익률:     ${(oos.avgReturn || 0).toFixed(2)}%`);
  console.log(`  체인 수익률:     ${(oos.totalChainedReturn || 0).toFixed(2)}%`);
  console.log(`  최종 자본:       ₩${Math.round(oos.chainedFinalCapital || 0).toLocaleString()}`);
  console.log(`  평균 MDD:        ${(oos.avgDrawdown || 0).toFixed(2)}%`);
  console.log(`  최악 MDD:        ${(oos.worstDrawdown || 0).toFixed(2)}%`);
  console.log(`  평균 승률:       ${(oos.avgWinRate || 0).toFixed(1)}%`);
  console.log(`  평균 샤프:       ${(oos.avgSharpe || 0).toFixed(2)}`);
  console.log(`  평균 PF:         ${(oos.avgProfitFactor || 0).toFixed(2)}`);
  console.log(`  총 거래 수:      ${oos.totalTrades || 0}`);

  console.log(`\n[분석]`);
  console.log(`  Robustness:      ${(analysis.robustnessRatio || 0).toFixed(1)}%`);
  console.log(`  Consistency:     ${(analysis.consistencyRatio || 0).toFixed(1)}%`);
  console.log(`  IS 평균 수익률:  ${(analysis.isAvgReturn || 0).toFixed(2)}%`);
  console.log(`  수익률 저하:     ${(analysis.returnDegradation || 0).toFixed(2)}%p`);
  console.log(`  ▶ 판정:          ${analysis.verdict || 'N/A'}`);

  if (result.file) {
    console.log(`\n  💾 저장: data/backtest-results/${result.file}`);
  }

  // 윈도우별 요약
  const chainedEquity = result.chainedEquity || [];
  if (chainedEquity.length) {
    console.log(`\n[윈도우별 OOS 수익률]`);
    chainedEquity.forEach((w, i) => {
      console.log(`  Window ${i + 1}: ${(w.return || 0).toFixed(2)}%`);
    });
  }
}

async function main() {
  console.log('🔬 워크포워드 재검증 시작 (앙상블 멀티마켓)');
  console.log(`  기간: ${COMMON_PARAMS.startDate} ~ ${COMMON_PARAMS.endDate}`);
  console.log(`  마켓: ${MARKETS.join(', ')} / ${COMMON_PARAMS.unit}분봉`);
  console.log(`  전략: ${STRATEGY}`);
  console.log(`  윈도우: ${COMMON_PARAMS.windows}, 훈련비율: ${COMMON_PARAMS.trainRatio}`);
  console.log(`  전략 파라미터 최적화: ${COMMON_PARAMS.optimizeStrategy}`);
  console.log('');

  const results = {};

  for (const market of MARKETS) {
    const label = `${STRATEGY}/${market}`;
    console.log(`\n⏳ [${label}] 워크포워드 실행 중...`);
    const startTime = Date.now();

    try {
      const result = await postJSON(`${BASE}/api/assets/backtest/walk-forward`, {
        ...COMMON_PARAMS,
        market,
        strategy: STRATEGY,
      });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ✅ 완료 (${elapsed}초)`);
      results[label] = result;
      printSummary(label, result);
    } catch (err) {
      console.log(`  ❌ 실패: ${err.message}`);
      results[label] = { error: err.message };
    }
  }

  // 최종 비교 테이블
  console.log('\n\n' + '='.repeat(60));
  console.log('📋 앙상블 멀티마켓 최종 비교');
  console.log('='.repeat(60));
  console.log(
    `${'마켓'.padEnd(25)} ${'OOS수익률'.padStart(10)} ${'MDD'.padStart(8)} ${'승률'.padStart(8)} ${'PF'.padStart(6)} ${'판정'.padStart(15)}`,
  );
  console.log('-'.repeat(75));

  let totalReturn = 0;
  let count = 0;
  for (const label of Object.keys(results)) {
    const r = results[label];
    if (r.error) {
      console.log(`${label.padEnd(25)} 에러: ${r.error}`);
      continue;
    }
    const oos = r.oos || {};
    const analysis = r.analysis || {};
    const ret = oos.totalChainedReturn || 0;
    totalReturn += ret;
    count++;
    console.log(
      `${label.padEnd(25)} ${(ret.toFixed(2) + '%').padStart(10)} ${((oos.worstDrawdown || 0).toFixed(2) + '%').padStart(8)} ${((oos.avgWinRate || 0).toFixed(1) + '%').padStart(8)} ${(oos.avgProfitFactor || 0).toFixed(2).padStart(6)} ${(analysis.verdict || 'N/A').padStart(15)}`,
    );
  }

  if (count > 0) {
    console.log('-'.repeat(75));
    console.log(`${'포트폴리오 평균'.padEnd(25)} ${(totalReturn / count).toFixed(2) + '%'}`);
    const weeklyAvg = (totalReturn / count / 14).toFixed(3);
    console.log(`${'주간 평균 수익률'.padEnd(25)} ${weeklyAvg}% (목표: 1.00%)`);
  }

  console.log('\n✅ 워크포워드 재검증 완료\n');
}

main().catch(console.error);
