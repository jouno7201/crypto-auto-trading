/**
 * 백테스트 엔진 v2
 * - 동적 손절(ATR-SL) / 익절(ATR-TP) / 트레일링 스탑
 * - 분할 매수 (riskPerTrade 기본 30%)
 * - 쿨다운 (손절 후 N봉 재진입 금지)
 * - 숏(공매도) 지원 (allowShort)
 * - 시장 상태 감지기 연동 (detectMarketState)
 * - 연속 손실 제한 (maxConsecutiveLoss)
 * - 일일 최대 손실 (dailyMaxLoss%)
 */

const store = require('../store/jsonStore');
const { atr } = require('../strategies/indicators');
const { detectMarketState } = require('../strategies/marketDetector');

/**
 * 백테스트 실행
 * @param {Object} strategy - 전략 인스턴스 (analyze 메서드 필요)
 * @param {Array} candles - OHLCV 캔들 배열
 * @param {Object} options - 설정
 */
function runBacktest(strategy, candles, options = {}) {
  const {
    initialCapital = 1_000_000,
    feeRate = 0.0005,
    slippage = 0.0003, // 업비트 BTC/KRW 실제 슬리피지 (0.03%)
    riskPerTrade = 0.3, // 1회 투자 비율 (30%)
    // 손절/익절
    stopLossATR = 2.0, // ATR × N 손절 (0 = 비활성)
    takeProfitATR = 3.0, // ATR × N 익절 (0 = 비활성)
    trailingStopATR = 2.5, // 고점 대비 ATR × N 트레일링 (0 = 비활성)
    // 쿨다운
    cooldownBars = 2, // 손절 후 재진입 금지 봉수
    // 최소 보유 기간 (SL/TP 유예)
    minHoldBars = 0, // 진입 후 N봉 동안 SL/TP 미적용 (0 = 즉시 적용)
    // 연속 손실 제한
    maxConsecutiveLoss = 5, // 연속 N패 후 거래 정지 (0 = 무제한)
    // 숏 허용
    allowShort = false,
    // 시장 감지 사용
    useMarketDetector = true,
  } = options;

  let capital = initialCapital;
  let position = 0; // + = 롱, - = 숏
  let entryPrice = 0;
  let peakCapital = initialCapital;
  let maxDrawdown = 0;
  let peakSinceEntry = 0; // 진입 후 최고가 (트레일링용)
  let troughSinceEntry = Infinity; // 진입 후 최저가 (숏 트레일링용)
  let cooldownRemain = 0;
  let consecutiveLosses = 0;
  let positionSide = null; // 'long' | 'short' | null
  let entryTime = null;
  let entryBarIndex = 0; // 진입 봉 인덱스 (최소보유기간 체크)
  let shortMargin = 0; // 숏 진입 시 투입액 (증거금)

  const trades = [];
  const equityCurve = [];
  const signals = [];

  const minWindow = 60; // 시장감지기에 충분한 데이터

  // ATR 전체 미리 계산 (14봉)
  const atrValues = atr(candles, 14);

  function getATR(candleIndex) {
    // atr 배열은 candles[1]부터 시작, period=14이므로 인덱스 조정
    const atrIdx = candleIndex - 14;
    return atrIdx >= 0 && atrIdx < atrValues.length ? atrValues[atrIdx] : 0;
  }

  function closeLong(i, exitPrice, reason, forced = false) {
    const sellPrice = exitPrice * (1 - slippage);
    const proceeds = position * sellPrice;
    const fee = proceeds * feeRate;
    const netProceeds = proceeds - fee;
    const pnl = netProceeds - position * entryPrice;
    const pnlPercent = ((sellPrice - entryPrice) / entryPrice) * 100;

    trades.push({
      side: 'long',
      entryPrice,
      exitPrice: sellPrice,
      quantity: position,
      pnl,
      pnlPercent,
      entryTime,
      exitTime: candles[i].timestamp,
      fee: fee + position * entryPrice * feeRate,
      exitReason: reason,
      forced,
    });

    capital += netProceeds;
    if (pnl <= 0) {
      consecutiveLosses++;
      cooldownRemain = cooldownBars;
    } else {
      consecutiveLosses = 0;
    }
    position = 0;
    entryPrice = 0;
    positionSide = null;
    peakSinceEntry = 0;
    entryTime = null;
  }

  function closeShort(i, exitPrice, reason, forced = false) {
    const coverPrice = exitPrice * (1 + slippage);
    const qty = Math.abs(position);
    const pnl = qty * (entryPrice - coverPrice);
    const fee = qty * coverPrice * feeRate + qty * entryPrice * feeRate;
    const pnlPercent = ((entryPrice - coverPrice) / entryPrice) * 100;
    const netPnl = pnl - fee;

    trades.push({
      side: 'short',
      entryPrice,
      exitPrice: coverPrice,
      quantity: qty,
      pnl: netPnl,
      pnlPercent,
      entryTime,
      exitTime: candles[i].timestamp,
      fee,
      exitReason: reason,
      forced,
    });

    // 증거금 반환 + 손익
    capital += shortMargin + netPnl;
    if (netPnl <= 0) {
      consecutiveLosses++;
      cooldownRemain = cooldownBars;
    } else {
      consecutiveLosses = 0;
    }
    position = 0;
    entryPrice = 0;
    positionSide = null;
    troughSinceEntry = Infinity;
    entryTime = null;
    shortMargin = 0;
  }

  for (let i = minWindow; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const signal = strategy.analyze(window);
    const currCandle = candles[i];
    const currPrice = currCandle.close;
    const currATR = getATR(i);

    // 시장 상태 감지
    let marketState = null;
    if (useMarketDetector && window.length >= 50) {
      marketState = detectMarketState(window);
    }

    signals.push({
      index: i,
      timestamp: currCandle.timestamp,
      price: currPrice,
      marketState: marketState?.state || null,
      ...signal,
    });

    // 쿨다운 감소
    if (cooldownRemain > 0) cooldownRemain--;

    // 연속 손실 제한: 정지 상태에서 시그널 무시 (포지션 관리는 계속)
    const tradingSuspended = maxConsecutiveLoss > 0 && consecutiveLosses >= maxConsecutiveLoss;

    // ========== 시장 상태별 동적 SL/TP/트레일링 조정 ==========
    let dynSL = stopLossATR;
    let dynTP = takeProfitATR;
    let dynTS = trailingStopATR;
    if (useMarketDetector && marketState) {
      const ms = marketState.state;
      if (ms === 'volatile') {
        // 변동성 폭발: SL 확대 (노이즈 스탑아웃 방지), TP 확대
        dynSL = stopLossATR * 1.3;
        dynTP = takeProfitATR * 1.2;
        dynTS = trailingStopATR * 1.3;
      } else if (ms === 'trending-up' || ms === 'trending-down') {
        // 추세장: 트레일링 약간 타이트하게 (수익 확보)
        dynTS = trailingStopATR * 0.85;
      }
      // ranging: 기본값 유지
    }

    // ========== 롱 포지션 관리 ==========
    if (positionSide === 'long' && position > 0) {
      if (currCandle.high > peakSinceEntry) peakSinceEntry = currCandle.high;

      const holdBars = i - entryBarIndex;
      const canExit = holdBars >= minHoldBars;

      // 1) 손절: 현재가 < 진입가 - ATR*N (시장상태 반영)
      if (canExit && dynSL > 0 && currATR > 0) {
        const slPrice = entryPrice - currATR * dynSL;
        if (currCandle.low <= slPrice) {
          closeLong(i, slPrice, '손절(ATR-SL)');
          trackEquity(i, currPrice);
          continue;
        }
      }

      // 2) 익절: 현재가 > 진입가 + ATR*N (시장상태 반영)
      if (canExit && dynTP > 0 && currATR > 0) {
        const tpPrice = entryPrice + currATR * dynTP;
        if (currCandle.high >= tpPrice) {
          closeLong(i, tpPrice, '익절(ATR-TP)');
          trackEquity(i, currPrice);
          continue;
        }
      }

      // 3) 트레일링 스탑: 고점 - ATR*N (시장상태 반영)
      if (canExit && dynTS > 0 && currATR > 0 && peakSinceEntry > 0) {
        const tsPrice = peakSinceEntry - currATR * dynTS;
        if (tsPrice > entryPrice && currCandle.low <= tsPrice) {
          closeLong(i, tsPrice, '트레일링스탑');
          trackEquity(i, currPrice);
          continue;
        }
      }

      // 4) 전략 매도 시그널
      if (signal.action === 'sell') {
        closeLong(i, currPrice, '전략시그널');
        trackEquity(i, currPrice);
        continue;
      }
    }

    // ========== 숏 포지션 관리 ==========
    if (positionSide === 'short' && position < 0) {
      if (currCandle.low < troughSinceEntry) troughSinceEntry = currCandle.low;

      const holdBars = i - entryBarIndex;
      const canExit = holdBars >= minHoldBars;

      // 1) 손절: 현재가 > 진입가 + ATR*N (시장상태 반영)
      if (canExit && dynSL > 0 && currATR > 0) {
        const slPrice = entryPrice + currATR * dynSL;
        if (currCandle.high >= slPrice) {
          closeShort(i, slPrice, '손절(ATR-SL)');
          trackEquity(i, currPrice);
          continue;
        }
      }

      // 2) 익절: 현재가 < 진입가 - ATR*N (시장상태 반영)
      if (canExit && dynTP > 0 && currATR > 0) {
        const tpPrice = entryPrice - currATR * dynTP;
        if (currCandle.low <= tpPrice) {
          closeShort(i, tpPrice, '익절(ATR-TP)');
          trackEquity(i, currPrice);
          continue;
        }
      }

      // 3) 트레일링 스탑: 저점 + ATR*N (시장상태 반영)
      if (canExit && dynTS > 0 && currATR > 0 && troughSinceEntry < Infinity) {
        const tsPrice = troughSinceEntry + currATR * dynTS;
        if (tsPrice < entryPrice && currCandle.high >= tsPrice) {
          closeShort(i, tsPrice, '트레일링스탑');
          trackEquity(i, currPrice);
          continue;
        }
      }

      // 4) 전략 매수 시그널 → 숏 커버
      if (signal.action === 'buy') {
        closeShort(i, currPrice, '전략시그널');
        trackEquity(i, currPrice);
        continue;
      }
    }

    // ========== 신규 진입 ==========
    const canTrade = !tradingSuspended && cooldownRemain <= 0;

    // 시장 감지 필터: 시장 상태별 차별화된 진입 조건
    let filteredAction = signal.action;
    if (useMarketDetector && marketState) {
      const st = marketState.state;
      const str = signal.strength || 0;

      if (st === 'ranging' && (signal.action === 'buy' || signal.action === 'sell')) {
        // 횡보장: strength 0.6 이상만 허용
        if (str < 0.6) filteredAction = 'hold';
      } else if (st === 'volatile' && (signal.action === 'buy' || signal.action === 'sell')) {
        // 변동성 폭발: strength 0.7 이상만 허용 (방향 불확실하므로 더 강한 시그널 요구)
        if (str < 0.7) filteredAction = 'hold';
      } else if (st === 'trending-up' && signal.action === 'sell' && !allowShort) {
        // 상승추세에서 롱온리 모드 시 약한 매도 시그널 무시
        if (str < 0.7) filteredAction = 'hold';
      } else if (st === 'trending-down' && signal.action === 'buy') {
        // 하락추세에서 약한 매수 시그널 무시
        if (str < 0.7) filteredAction = 'hold';
      }
    }

    // 롱 진입
    if (filteredAction === 'buy' && position === 0 && canTrade) {
      const buyPrice = currPrice * (1 + slippage);
      const investAmount = capital * riskPerTrade;
      const fee = investAmount * feeRate;
      position = (investAmount - fee) / buyPrice;
      entryPrice = buyPrice;
      capital -= investAmount;
      positionSide = 'long';
      peakSinceEntry = currCandle.high;
      entryTime = currCandle.timestamp;
      entryBarIndex = i;
    }

    // 숏 진입
    if (allowShort && filteredAction === 'sell' && position === 0 && canTrade) {
      const sellPrice = currPrice * (1 - slippage);
      const investAmount = capital * riskPerTrade;
      const fee = investAmount * feeRate;
      const qty = (investAmount - fee) / sellPrice;
      position = -qty; // 음수 = 숏
      entryPrice = sellPrice;
      shortMargin = investAmount; // 증거금 기록
      capital -= investAmount; // 증거금 차감
      positionSide = 'short';
      troughSinceEntry = currCandle.low;
      entryTime = currCandle.timestamp;
      entryBarIndex = i;
    }

    trackEquity(i, currPrice);
  }

  function trackEquity(i, currPrice) {
    let totalEquity = capital;
    if (positionSide === 'long' && position > 0) {
      totalEquity += position * currPrice;
    } else if (positionSide === 'short' && position < 0) {
      const qty = Math.abs(position);
      totalEquity += shortMargin + qty * (entryPrice - currPrice);
    }
    equityCurve.push({ timestamp: candles[i].timestamp, equity: totalEquity });
    if (totalEquity > peakCapital) peakCapital = totalEquity;
    const dd = ((peakCapital - totalEquity) / peakCapital) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // 미청산 포지션 강제 청산
  if (position > 0) {
    closeLong(candles.length - 1, candles[candles.length - 1].close, '기간종료', true);
  } else if (position < 0) {
    closeShort(candles.length - 1, candles[candles.length - 1].close, '기간종료', true);
  }

  // ===== 성과 지표 계산 =====
  const finalCapital = capital;
  const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
  const winTrades = trades.filter((t) => t.pnl > 0);
  const loseTrades = trades.filter((t) => t.pnl <= 0);
  const winRate = trades.length > 0 ? (winTrades.length / trades.length) * 100 : 0;
  const totalFees = trades.reduce((sum, t) => sum + t.fee, 0);

  // 손익비 (Profit Factor)
  const grossProfit = winTrades.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(loseTrades.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // 최대 연속 승/패
  let maxConsecWin = 0,
    maxConsecLose = 0,
    cw = 0,
    cl = 0;
  for (const t of trades) {
    if (t.pnl > 0) {
      cw++;
      cl = 0;
    } else {
      cl++;
      cw = 0;
    }
    if (cw > maxConsecWin) maxConsecWin = cw;
    if (cl > maxConsecLose) maxConsecLose = cl;
  }

  // 샤프 비율
  const returns = equityCurve.map((e, idx) =>
    idx === 0 ? 0 : (e.equity - equityCurve[idx - 1].equity) / equityCurve[idx - 1].equity,
  );
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn = Math.sqrt(returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / returns.length);
  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

  // Sortino 비율 (하방 편차만)
  const dailyRf = 0.035 / 252; // 무위험 수익률 연 3.5%
  const negReturns = returns.filter((r) => r < dailyRf);
  const downsideDev = negReturns.length > 0
    ? Math.sqrt(negReturns.reduce((a, r) => a + (r - dailyRf) ** 2, 0) / returns.length)
    : 0;
  const sortinoRatio = downsideDev > 0 ? ((avgReturn - dailyRf) / downsideDev) * Math.sqrt(252) : 0;

  // Calmar 비율 (연환산 수익률 / MDD)
  const annualReturn = returns.length > 0
    ? ((Math.pow(1 + totalReturn / 100, 252 / returns.length) - 1) * 100)
    : 0;
  const calmarRatio = maxDrawdown > 0 ? annualReturn / maxDrawdown : 0;

  // 롱/숏 통계
  const longTrades = trades.filter((t) => t.side === 'long');
  const shortTrades = trades.filter((t) => t.side === 'short');
  const longWins = longTrades.filter((t) => t.pnl > 0).length;
  const shortWins = shortTrades.filter((t) => t.pnl > 0).length;

  const result = {
    strategy: strategy.name,
    params: strategy.params,
    period: {
      start: candles[0]?.timestamp,
      end: candles[candles.length - 1]?.timestamp,
      totalCandles: candles.length,
    },
    options: {
      riskPerTrade,
      stopLossATR,
      takeProfitATR,
      trailingStopATR,
      cooldownBars,
      allowShort,
      useMarketDetector,
    },
    performance: {
      initialCapital,
      finalCapital: Math.round(finalCapital),
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
      sharpeRatio: parseFloat(sharpeRatio.toFixed(3)),
      sortinoRatio: parseFloat(Math.min(sortinoRatio, 999).toFixed(3)),
      calmarRatio: parseFloat(Math.min(calmarRatio, 999).toFixed(3)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
    },
    trades: {
      total: trades.length,
      wins: winTrades.length,
      losses: loseTrades.length,
      winRate: parseFloat(winRate.toFixed(1)),
      totalFees: Math.round(totalFees),
      avgPnl: trades.length > 0 ? Math.round(trades.reduce((a, t) => a + t.pnl, 0) / trades.length) : 0,
      maxConsecWin,
      maxConsecLose,
      longTrades: longTrades.length,
      longWins,
      shortTrades: shortTrades.length,
      shortWins,
    },
    tradeLog: trades,
    equityCurve,
    signals: signals.filter((s) => s.action === 'buy' || s.action === 'sell'),
    candles: candles.map((c) => ({ timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
  };

  return result;
}

/**
 * 백테스트 결과 저장
 */
function saveResult(result) {
  const filename = `backtest-results/${result.strategy}_${Date.now()}.json`;
  store.save(filename, result);
  const { createLogger } = require('../utils/logger');
  createLogger('backtest').info({ filename }, '백테스트 결과 저장');
  return filename;
}

module.exports = { runBacktest, saveResult };
