/**
 * 주 1% 목표 워크포워드 검증 스크립트
 * MACD 전략 - 60분봉 / 15분봉 비교, 멀티마켓 검증
 * 업비트 API 429 방지: 테스트 사이 90초 딜레이
 */

const http = require('http');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function wf(strategy, market, unit) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      strategy,
      market,
      unit,
      startDate: '2026-01-01',
      endDate: '2026-04-11',
      capital: 1000000,
      windows: 4,
      trainRatio: 0.7,
      allowShort: false,
      useMarketDetector: true,
      optimizeStrategy: true,
      metric: 'calmar',
    });
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3008,
        path: '/api/assets/backtest/walk-forward',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(chunks);
            if (res.statusCode !== 200) {
              reject(new Error('HTTP ' + res.statusCode + ': ' + (data.error || 'unknown')));
            } else {
              resolve(data);
            }
          } catch (e) {
            reject(new Error('JSON parse: ' + chunks.slice(0, 200)));
          }
        });
      },
    );
    req.setTimeout(600000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const tests = [
    { name: 'MACD 60min BTC', strategy: 'macd', market: 'KRW-BTC', unit: '60' },
    { name: 'MACD 60min ETH', strategy: 'macd', market: 'KRW-ETH', unit: '60' },
    { name: 'MACD 60min XRP', strategy: 'macd', market: 'KRW-XRP', unit: '60' },
  ];

  console.log('='.repeat(60));
  console.log('🔬 주 1% 목표 워크포워드 검증 (그리드 복원)');
  console.log('   기간: 2026-01-01 ~ 2026-04-11 (약 14주)');
  console.log('   주 1% = 14주간 +14% 이상 필요');
  console.log('   864 콤보/윈도우 (원래 WF 그리드)');
  console.log('='.repeat(60));

  const results = [];

  for (const t of tests) {
    console.log('\n⏳ ' + t.name + '...');
    const start = Date.now();
    try {
      const r = await wf(t.strategy, t.market, t.unit);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const oos = r.oos || {};
      const an = r.analysis || {};
      const eq = r.chainedEquity || [];

      console.log('  ✅ 완료 (' + elapsed + 's)');
      console.log('  OOS 평균수익:  ' + (oos.avgReturn || 0).toFixed(2) + '%');
      console.log('  체인 수익률:   ' + (oos.totalChainedReturn || 0).toFixed(2) + '%');
      console.log('  최종자본:      ₩' + Math.round(oos.chainedFinalCapital || 0).toLocaleString());
      console.log('  승률:          ' + (oos.avgWinRate || 0).toFixed(1) + '%');
      console.log('  샤프:          ' + (oos.avgSharpe || 0).toFixed(2));
      console.log('  PF:            ' + (oos.avgProfitFactor || 0).toFixed(2));
      console.log('  거래수:        ' + (oos.totalTrades || 0));
      console.log('  최악 MDD:      ' + (oos.worstDrawdown || 0).toFixed(2) + '%');
      console.log('  판정:          ' + (an.verdict || 'N/A'));

      eq.forEach((w) => console.log('    W' + w.window + ': ' + (w.return || 0).toFixed(2) + '%'));

      const bp = r.windowDetails?.[0]?.bestParams;
      if (bp) {
        console.log('  W1 최적 엔진:  ' + JSON.stringify(bp.engine || {}));
        if (bp.strategy) console.log('  W1 최적 전략:  ' + JSON.stringify(bp.strategy));
      }

      // 주간 수익률 환산 (14주 기준)
      const weeklyAvg = (oos.totalChainedReturn || 0) / 14;
      console.log('  주간 평균수익: ' + weeklyAvg.toFixed(3) + '% (목표 1%)');

      results.push({ name: t.name, oos, an, weeklyAvg });
    } catch (e) {
      console.log('  ❌ 에러: ' + e.message);
      results.push({ name: t.name, error: e.message });
    }

    // 업비트 429 방지 딜레이 (마지막 테스트 제외)
    if (tests.indexOf(t) < tests.length - 1) {
      console.log('  ⏱️  90초 대기 (업비트 rate limit 방지)...');
      await sleep(90000);
    }
  }

  // 최종 비교
  console.log('\n\n' + '='.repeat(60));
  console.log('📋 최종 비교');
  console.log('='.repeat(60));
  console.log(
    '전략'.padEnd(22) +
      'OOS수익'.padStart(9) +
      '주간평균'.padStart(9) +
      '승률'.padStart(7) +
      '샤프'.padStart(7) +
      'PF'.padStart(6) +
      '거래'.padStart(5) +
      ' 판정',
  );
  console.log('-'.repeat(75));

  for (const r of results) {
    if (r.error) {
      console.log(r.name.padEnd(22) + ' 에러');
      continue;
    }
    const oos = r.oos;
    console.log(
      r.name.padEnd(22) +
        ((oos.totalChainedReturn || 0).toFixed(2) + '%').padStart(9) +
        ((r.weeklyAvg || 0).toFixed(3) + '%').padStart(9) +
        ((oos.avgWinRate || 0).toFixed(1) + '%').padStart(7) +
        (oos.avgSharpe || 0).toFixed(2).padStart(7) +
        (oos.avgProfitFactor || 0).toFixed(2).padStart(6) +
        String(oos.totalTrades || 0).padStart(5) +
        ' ' +
        (r.an.verdict || 'N/A'),
    );
  }

  console.log('\n✅ 워크포워드 검증 완료');
}

main().catch(console.error);
