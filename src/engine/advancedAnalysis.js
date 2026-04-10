/**
 * 고급 분석 엔진
 * - 몬테카를로 시뮬레이션 (전략 기대 분포)
 * - Sortino / Calmar 비율
 * - 드로다운 분석 (기간별, 원인별)
 * - 시장 벤치마크 대비 성과 비교 (BTC B&H vs 전략)
 */

const store = require('../store/jsonStore');

/**
 * 몬테카를로 시뮬레이션
 * 기존 매매 수익률 분포에서 무작위 리샘플링하여 전략 기대 분포를 계산
 * @param {Object} opts
 * @param {number} [opts.simulations=1000] - 시뮬레이션 횟수
 * @param {number} [opts.tradeCount] - 시뮬당 거래 횟수 (없으면 실제 데이터 길이)
 * @param {number} [opts.initialCapital=1000000] - 초기 자본
 * @param {string} [opts.market] - 특정 마켓 필터
 */
function monteCarlo(opts = {}) {
  const { simulations = 1000, initialCapital = 1000000, market } = opts;

  let trades = store.load('trades.json', []).filter((t) => t.pnl !== undefined);
  if (market) trades = trades.filter((t) => t.market === market);
  if (trades.length < 5) return { error: '분석에 필요한 최소 거래 수(5건)가 부족합니다' };

  const pnls = trades.map((t) => t.pnl || 0);
  const tradeCount = opts.tradeCount || pnls.length;
  const results = [];

  for (let sim = 0; sim < simulations; sim++) {
    let capital = initialCapital;
    let peak = capital;
    let maxDD = 0;

    for (let i = 0; i < tradeCount; i++) {
      const idx = Math.floor(Math.random() * pnls.length);
      capital += pnls[idx];
      if (capital > peak) peak = capital;
      const dd = peak > 0 ? ((peak - capital) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    }

    results.push({
      finalCapital: Math.round(capital),
      returnPct: parseFloat((((capital - initialCapital) / initialCapital) * 100).toFixed(2)),
      maxDrawdown: parseFloat(maxDD.toFixed(2)),
    });
  }

  // 통계 계산
  results.sort((a, b) => a.returnPct - b.returnPct);
  const returns = results.map((r) => r.returnPct);
  const drawdowns = results.map((r) => r.maxDrawdown);

  const percentile = (arr, p) => {
    const idx = Math.floor((arr.length - 1) * (p / 100));
    return arr[idx];
  };

  return {
    simulations,
    tradeCount,
    inputTrades: pnls.length,
    initialCapital,
    distribution: {
      mean: parseFloat((returns.reduce((a, b) => a + b, 0) / returns.length).toFixed(2)),
      median: percentile(returns, 50),
      p5: percentile(returns, 5),
      p25: percentile(returns, 25),
      p75: percentile(returns, 75),
      p95: percentile(returns, 95),
      min: returns[0],
      max: returns[returns.length - 1],
    },
    drawdown: {
      mean: parseFloat((drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length).toFixed(2)),
      median: percentile(drawdowns.sort((a, b) => a - b), 50),
      p95: percentile(drawdowns.sort((a, b) => a - b), 95),
      max: Math.max(...drawdowns),
    },
    // 히스토그램 (10개 구간)
    histogram: buildHistogram(returns, 10),
    // 파산 확률 (자본 50% 이상 손실)
    ruinProbability: parseFloat(
      ((results.filter((r) => r.returnPct <= -50).length / simulations) * 100).toFixed(2),
    ),
  };
}

/**
 * 히스토그램 빌드
 */
function buildHistogram(values, bins) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const binWidth = range / bins;
  const histogram = [];

  for (let i = 0; i < bins; i++) {
    const lo = min + i * binWidth;
    const hi = i === bins - 1 ? max + 1 : lo + binWidth;
    const count = values.filter((v) => v >= lo && v < hi).length;
    histogram.push({
      range: `${lo.toFixed(1)}~${(hi - (i === bins - 1 ? 1 : 0)).toFixed(1)}`,
      count,
      pct: parseFloat(((count / values.length) * 100).toFixed(1)),
    });
  }
  return histogram;
}

/**
 * 고급 성과 지표 계산 (Sortino, Calmar 포함)
 * @param {Object} opts
 * @param {string} [opts.market] - 특정 마켓 필터
 * @param {number} [opts.initialCapital=1000000] - 초기 자본
 * @param {number} [opts.riskFreeRate=0.035] - 무위험 수익률 (연 3.5%)
 */
function advancedMetrics(opts = {}) {
  const { initialCapital = 1000000, riskFreeRate = 0.035, market } = opts;

  let trades = store.load('trades.json', []).filter((t) => t.pnl !== undefined);
  if (market) trades = trades.filter((t) => t.market === market);
  if (!trades.length) return { error: '거래 데이터가 없습니다' };

  // 일별 수익률 계산
  const dailyPnl = {};
  trades.forEach((t) => {
    const day = (t.createdAt || t.exitTime || t.time || '').slice(0, 10);
    if (!dailyPnl[day]) dailyPnl[day] = 0;
    dailyPnl[day] += t.pnl || 0;
  });

  const days = Object.keys(dailyPnl).sort();
  let cumCapital = initialCapital;
  const dailyReturns = [];

  days.forEach((day) => {
    const ret = cumCapital > 0 ? dailyPnl[day] / cumCapital : 0;
    dailyReturns.push(ret);
    cumCapital += dailyPnl[day];
  });

  const totalReturn = ((cumCapital - initialCapital) / initialCapital) * 100;
  const tradingDays = dailyReturns.length || 1;
  const annualizeFactor = Math.sqrt(252);

  // Sharpe Ratio
  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / tradingDays;
  const dailyRf = riskFreeRate / 252;
  const excessReturns = dailyReturns.map((r) => r - dailyRf);
  const avgExcess = excessReturns.reduce((a, b) => a + b, 0) / tradingDays;
  const stdReturn = Math.sqrt(
    dailyReturns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / tradingDays,
  );
  const sharpeRatio = stdReturn > 0 ? (avgExcess / stdReturn) * annualizeFactor : 0;

  // Sortino Ratio (하방 편차만 사용)
  const negativeReturns = dailyReturns.filter((r) => r < dailyRf);
  const downsideDeviation = negativeReturns.length > 0
    ? Math.sqrt(negativeReturns.reduce((a, r) => a + (r - dailyRf) ** 2, 0) / tradingDays)
    : 0;
  const sortinoRatio = downsideDeviation > 0
    ? (avgExcess / downsideDeviation) * annualizeFactor
    : avgExcess > 0 ? Infinity : 0;

  // Max Drawdown & Calmar Ratio
  let peak = initialCapital;
  let maxDD = 0;
  cumCapital = initialCapital;
  days.forEach((day) => {
    cumCapital += dailyPnl[day];
    if (cumCapital > peak) peak = cumCapital;
    const dd = peak > 0 ? ((peak - cumCapital) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  });

  const annualReturn = tradingDays > 0
    ? ((Math.pow(cumCapital / initialCapital, 252 / tradingDays) - 1) * 100)
    : 0;
  const calmarRatio = maxDD > 0 ? annualReturn / maxDD : annualReturn > 0 ? Infinity : 0;

  // Profit Factor
  const grossProfit = trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // 기대값 (Expectancy)
  const avgWin = trades.filter((t) => t.pnl > 0).length > 0
    ? grossProfit / trades.filter((t) => t.pnl > 0).length : 0;
  const avgLoss = trades.filter((t) => t.pnl < 0).length > 0
    ? grossLoss / trades.filter((t) => t.pnl < 0).length : 0;
  const winRate = trades.length > 0
    ? trades.filter((t) => t.pnl > 0).length / trades.length : 0;
  const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);

  return {
    totalTrades: trades.length,
    tradingDays,
    totalReturn: parseFloat(totalReturn.toFixed(2)),
    annualReturn: parseFloat(annualReturn.toFixed(2)),
    maxDrawdown: parseFloat(maxDD.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(3)),
    sortinoRatio: parseFloat(Math.min(sortinoRatio, 999).toFixed(3)),
    calmarRatio: parseFloat(Math.min(calmarRatio, 999).toFixed(3)),
    profitFactor: parseFloat(Math.min(profitFactor, 999).toFixed(2)),
    winRate: parseFloat((winRate * 100).toFixed(1)),
    expectancy: Math.round(expectancy),
    avgWin: Math.round(avgWin),
    avgLoss: Math.round(avgLoss),
  };
}

/**
 * 드로다운 분석 (기간별, 원인별)
 * @param {Object} opts
 * @param {string} [opts.market] - 특정 마켓 필터
 * @param {number} [opts.initialCapital=1000000]
 * @param {number} [opts.topN=5] - 상위 N개 드로다운
 */
function drawdownAnalysis(opts = {}) {
  const { initialCapital = 1000000, topN = 5, market } = opts;

  let trades = store.load('trades.json', []).filter((t) => t.pnl !== undefined);
  if (market) trades = trades.filter((t) => t.market === market);
  if (!trades.length) return { error: '거래 데이터가 없습니다' };

  // 일별 자본 + 드로다운 추적
  const dailyPnl = {};
  const dailyTrades = {};
  trades.forEach((t) => {
    const day = (t.createdAt || t.exitTime || t.time || '').slice(0, 10);
    if (!dailyPnl[day]) dailyPnl[day] = 0;
    if (!dailyTrades[day]) dailyTrades[day] = [];
    dailyPnl[day] += t.pnl || 0;
    dailyTrades[day].push(t);
  });

  const days = Object.keys(dailyPnl).sort();
  let capital = initialCapital;
  let peak = initialCapital;
  let peakDate = days[0];
  let inDrawdown = false;
  let ddStart = null;
  const drawdowns = [];
  const timeline = [];

  days.forEach((day) => {
    capital += dailyPnl[day];
    const ddPct = peak > 0 ? ((peak - capital) / peak) * 100 : 0;

    timeline.push({
      date: day,
      capital: Math.round(capital),
      peak: Math.round(peak),
      drawdownPct: parseFloat(ddPct.toFixed(2)),
    });

    if (capital > peak) {
      // 새로운 고점: 드로다운 종료
      if (inDrawdown && ddStart) {
        ddStart.endDate = day;
        ddStart.duration = days.indexOf(day) - days.indexOf(ddStart.startDate);
        ddStart.recovery = day;
        drawdowns.push(ddStart);
      }
      peak = capital;
      peakDate = day;
      inDrawdown = false;
      ddStart = null;
    } else if (ddPct > 0) {
      if (!inDrawdown) {
        // 드로다운 시작
        inDrawdown = true;
        ddStart = {
          startDate: peakDate,
          peakCapital: Math.round(peak),
          troughDate: day,
          troughCapital: Math.round(capital),
          maxDrawdownPct: parseFloat(ddPct.toFixed(2)),
          trades: [],
        };
      }
      // 드로다운 심화
      if (ddPct > ddStart.maxDrawdownPct) {
        ddStart.troughDate = day;
        ddStart.troughCapital = Math.round(capital);
        ddStart.maxDrawdownPct = parseFloat(ddPct.toFixed(2));
      }
      ddStart.trades.push(...(dailyTrades[day] || []));
    }
  });

  // 아직 진행 중인 드로다운
  if (inDrawdown && ddStart) {
    ddStart.endDate = null;
    ddStart.duration = days.length - days.indexOf(ddStart.startDate);
    ddStart.recovery = null;
    drawdowns.push(ddStart);
  }

  // 상위 N개 드로다운 정렬
  drawdowns.sort((a, b) => b.maxDrawdownPct - a.maxDrawdownPct);
  const topDrawdowns = drawdowns.slice(0, topN).map((dd) => {
    // 원인 분석: 어떤 전략/마켓에서 가장 큰 손실?
    const lossTrades = dd.trades.filter((t) => (t.pnl || 0) < 0);
    const byMarket = {};
    const byStrategy = {};
    const byReason = {};

    lossTrades.forEach((t) => {
      const m = t.market || 'unknown';
      const s = t.strategy || 'unknown';
      const r = t.reason || 'unknown';
      byMarket[m] = (byMarket[m] || 0) + Math.abs(t.pnl || 0);
      byStrategy[s] = (byStrategy[s] || 0) + Math.abs(t.pnl || 0);
      byReason[r] = (byReason[r] || 0) + Math.abs(t.pnl || 0);
    });

    return {
      startDate: dd.startDate,
      troughDate: dd.troughDate,
      endDate: dd.endDate,
      recovery: dd.recovery,
      duration: dd.duration,
      maxDrawdownPct: dd.maxDrawdownPct,
      peakCapital: dd.peakCapital,
      troughCapital: dd.troughCapital,
      lossTrades: lossTrades.length,
      causes: {
        byMarket: sortObj(byMarket),
        byStrategy: sortObj(byStrategy),
        byReason: sortObj(byReason),
      },
    };
  });

  return {
    totalDrawdowns: drawdowns.length,
    currentlyInDrawdown: inDrawdown,
    topDrawdowns,
    timeline,
  };
}

/**
 * 벤치마크 비교 (전략 vs BTC Buy & Hold)
 * @param {Object} opts
 * @param {string} [opts.market='KRW-BTC'] - 벤치마크 마켓
 * @param {number} [opts.initialCapital=1000000]
 */
function benchmarkComparison(opts = {}) {
  const { market = 'KRW-BTC', initialCapital = 1000000 } = opts;

  let trades = store.load('trades.json', []).filter((t) => t.pnl !== undefined);
  if (!trades.length) return { error: '거래 데이터가 없습니다' };

  // 전략 수익률 곡선 (일별)
  const dailyPnl = {};
  trades.forEach((t) => {
    const day = (t.createdAt || t.exitTime || t.time || '').slice(0, 10);
    if (!dailyPnl[day]) dailyPnl[day] = 0;
    dailyPnl[day] += t.pnl || 0;
  });

  const days = Object.keys(dailyPnl).sort();
  if (days.length < 2) return { error: '비교에 필요한 최소 2일 이상의 데이터가 필요합니다' };

  // 전략 에쿼티 곡선
  let strategyCapital = initialCapital;
  const strategyCurve = [];
  days.forEach((day) => {
    strategyCapital += dailyPnl[day];
    strategyCurve.push({
      date: day,
      capital: Math.round(strategyCapital),
      returnPct: parseFloat((((strategyCapital - initialCapital) / initialCapital) * 100).toFixed(2)),
    });
  });

  // BTC B&H: 캔들 데이터에서 가격 추출
  const cacheKey = `candles/${market}_day.json`;
  const candles = store.load(cacheKey, []);

  let bhCurve = [];
  if (candles.length >= 2) {
    // 전략 기간과 매칭되는 캔들 필터
    const startDay = days[0];
    const endDay = days[days.length - 1];
    const filtered = candles.filter((c) => {
      const d = new Date(c.timestamp || c.candle_date_time_kst).toISOString().slice(0, 10);
      return d >= startDay && d <= endDay;
    });

    if (filtered.length >= 2) {
      const entryPrice = filtered[0].trade_price || filtered[0].close;
      const bhUnits = initialCapital / entryPrice;

      bhCurve = filtered.map((c) => {
        const price = c.trade_price || c.close;
        const d = new Date(c.timestamp || c.candle_date_time_kst).toISOString().slice(0, 10);
        const bhCapital = bhUnits * price;
        return {
          date: d,
          capital: Math.round(bhCapital),
          returnPct: parseFloat((((bhCapital - initialCapital) / initialCapital) * 100).toFixed(2)),
          price: Math.round(price),
        };
      });
    }
  }

  // 비교 요약
  const strategyReturn = strategyCurve.length > 0 ? strategyCurve[strategyCurve.length - 1].returnPct : 0;
  const bhReturn = bhCurve.length > 0 ? bhCurve[bhCurve.length - 1].returnPct : null;
  const alpha = bhReturn !== null ? parseFloat((strategyReturn - bhReturn).toFixed(2)) : null;

  return {
    period: { start: days[0], end: days[days.length - 1], tradingDays: days.length },
    strategy: {
      finalCapital: Math.round(strategyCapital),
      returnPct: strategyReturn,
      curve: strategyCurve,
    },
    benchmark: {
      market,
      finalCapital: bhCurve.length > 0 ? bhCurve[bhCurve.length - 1].capital : null,
      returnPct: bhReturn,
      curve: bhCurve,
      available: bhCurve.length > 0,
    },
    alpha,
    outperformed: alpha !== null ? alpha > 0 : null,
  };
}

/**
 * 객체를 값 기준 내림차순 정렬
 */
function sortObj(obj) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([name, loss]) => ({ name, loss: Math.round(loss) }));
}

module.exports = { monteCarlo, advancedMetrics, drawdownAnalysis, benchmarkComparison };
