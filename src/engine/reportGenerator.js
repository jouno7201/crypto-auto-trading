/**
 * 리포트 생성 엔진
 * - 일간/주간/월간 성과 리포트 자동 생성
 * - CSV 데이터 다운로드
 * - PDF 리포트 생성
 */

const fs = require('fs');
const path = require('path');
const store = require('../store/jsonStore');

const REPORT_DIR = path.join(store.DATA_DIR, 'reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

/**
 * 기간별 매매 데이터 집계
 * @param {'daily'|'weekly'|'monthly'} period
 * @param {string} [date] - 기준일 (YYYY-MM-DD), 없으면 오늘
 */
function generateReport(period = 'daily', date) {
  const baseDate = date ? new Date(date) : new Date();
  const { start, end, label } = getDateRange(period, baseDate);

  const allTrades = store.load('trades.json', []);
  const trades = allTrades.filter((t) => {
    const d = new Date(t.createdAt || t.exitTime || t.time);
    return d >= start && d <= end;
  });

  const allOrders = store.load('orders.json', []);
  const orders = allOrders.filter((o) => {
    const d = new Date(o.createdAt || o.time);
    return d >= start && d <= end;
  });

  // 성과 지표 계산
  const wins = trades.filter((t) => (t.pnl || 0) > 0);
  const losses = trades.filter((t) => (t.pnl || 0) < 0);
  const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalFees = trades.reduce((s, t) => s + (t.fee || 0), 0);

  // 일별 수익 추적 (MDD 계산용)
  const dailyPnl = {};
  trades.forEach((t) => {
    const day = (t.createdAt || t.exitTime || t.time || '').slice(0, 10);
    if (!dailyPnl[day]) dailyPnl[day] = 0;
    dailyPnl[day] += t.pnl || 0;
  });

  const days = Object.keys(dailyPnl).sort();
  let cumPnl = 0;
  let peak = 0;
  let mdd = 0;
  const equityCurve = [];
  days.forEach((day) => {
    cumPnl += dailyPnl[day];
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0;
    if (dd > mdd) mdd = dd;
    equityCurve.push({ date: day, pnl: dailyPnl[day], cumPnl });
  });

  const report = {
    period,
    label,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    summary: {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length ? parseFloat(((wins.length / trades.length) * 100).toFixed(1)) : 0,
      totalPnl: Math.round(totalPnl),
      avgPnl: trades.length ? Math.round(totalPnl / trades.length) : 0,
      totalFees: Math.round(totalFees),
      netPnl: Math.round(totalPnl - totalFees),
      maxDrawdown: parseFloat(mdd.toFixed(2)),
      bestTrade: trades.length ? Math.round(Math.max(...trades.map((t) => t.pnl || 0))) : 0,
      worstTrade: trades.length ? Math.round(Math.min(...trades.map((t) => t.pnl || 0))) : 0,
    },
    equityCurve,
    trades,
    orders,
    totalOrders: orders.length,
  };

  // 저장
  const filename = `report_${period}_${report.startDate}_${report.endDate}.json`;
  const filePath = path.join(REPORT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');

  return { ...report, file: filename };
}

/**
 * 기간 범위 계산
 */
function getDateRange(period, baseDate) {
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);
  let start, end, label;

  switch (period) {
    case 'daily': {
      start = new Date(d);
      end = new Date(d);
      end.setHours(23, 59, 59, 999);
      label = `일간 리포트 (${d.toISOString().slice(0, 10)})`;
      break;
    }
    case 'weekly': {
      const day = d.getDay();
      start = new Date(d);
      start.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // 월요일
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      label = `주간 리포트 (${start.toISOString().slice(0, 10)} ~ ${end.toISOString().slice(0, 10)})`;
      break;
    }
    case 'monthly': {
      start = new Date(d.getFullYear(), d.getMonth(), 1);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      label = `월간 리포트 (${d.getFullYear()}년 ${d.getMonth() + 1}월)`;
      break;
    }
    default:
      throw new Error(`지원하지 않는 리포트 기간: ${period}`);
  }

  return { start, end, label };
}

/**
 * 매매 데이터를 CSV 문자열로 변환
 */
function tradesToCSV(trades) {
  if (!trades.length) return '데이터 없음\n';
  const headers = ['번호', '시간', '마켓', '타입', '가격', '수량', '손익(원)', '손익률(%)', '수수료(원)'];
  const rows = trades.map((t, i) => [
    i + 1,
    t.createdAt || t.exitTime || t.time || '',
    t.market || '',
    t.side || t.type || '',
    t.price || t.entryPrice || '',
    t.volume || t.amount || '',
    Math.round(t.pnl || 0),
    (t.pnlPercent || 0).toFixed(2),
    Math.round(t.fee || 0),
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n';
}

/**
 * 리포트를 PDF로 생성
 */
function generatePDF(report) {
  const PDFDocument = require('pdfkit');

  return new Promise((resolve, reject) => {
    const filename = `report_${report.period}_${report.startDate}_${report.endDate}.pdf`;
    const filePath = path.join(REPORT_DIR, filename);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // 한글 폰트 (.ttf만 지원, .ttc는 pdfkit 미지원)
    const koreanFonts = [
      '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
      '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
    ];
    const koreanFont = koreanFonts.find((f) => fs.existsSync(f));
    if (koreanFont) doc.registerFont('Korean', koreanFont);
    const fontName = koreanFont ? 'Korean' : 'Helvetica';

    // 제목
    doc.font(fontName).fontSize(20).text(report.label, { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .fillColor('#666')
      .text(`Generated: ${report.generatedAt.slice(0, 19)}`, { align: 'center' });
    doc.moveDown(1.5);

    // 요약 카드
    const s = report.summary;
    doc.fillColor('#000');
    doc.fontSize(14).text('Performance Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);

    const summaryItems = [
      ['Total Trades', `${s.totalTrades} (Win: ${s.wins} / Loss: ${s.losses})`],
      ['Win Rate', `${s.winRate}%`],
      ['Total PnL', `${s.totalPnl >= 0 ? '+' : ''}${s.totalPnl.toLocaleString()} KRW`],
      ['Net PnL (after fees)', `${s.netPnl >= 0 ? '+' : ''}${s.netPnl.toLocaleString()} KRW`],
      ['Total Fees', `${s.totalFees.toLocaleString()} KRW`],
      ['Avg PnL per Trade', `${s.avgPnl >= 0 ? '+' : ''}${s.avgPnl.toLocaleString()} KRW`],
      ['Max Drawdown', `-${s.maxDrawdown}%`],
      ['Best Trade', `+${s.bestTrade.toLocaleString()} KRW`],
      ['Worst Trade', `${s.worstTrade.toLocaleString()} KRW`],
    ];

    summaryItems.forEach(([label, value]) => {
      doc.text(`  ${label}: ${value}`);
    });
    doc.moveDown(1.5);

    // 일별 수익 테이블
    if (report.equityCurve.length) {
      doc.fontSize(14).text('Daily PnL', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9);
      report.equityCurve.forEach((e) => {
        const sign = e.pnl >= 0 ? '+' : '';
        doc.text(
          `  ${e.date}  |  PnL: ${sign}${Math.round(e.pnl).toLocaleString()}  |  Cumulative: ${sign}${Math.round(e.cumPnl).toLocaleString()}`,
        );
      });
      doc.moveDown(1.5);
    }

    // 매매 내역 (최대 50건)
    const tradeList = report.trades.slice(-50);
    if (tradeList.length) {
      doc.fontSize(14).text(`Trade Log (latest ${tradeList.length})`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(8);
      tradeList.forEach((t, i) => {
        const pnl = Math.round(t.pnl || 0);
        const time = (t.createdAt || t.exitTime || t.time || '').slice(0, 19);
        doc.text(
          `  #${i + 1}  ${time}  ${t.market || '-'}  ${t.side || t.type || '-'}  PnL: ${pnl >= 0 ? '+' : ''}${pnl.toLocaleString()}`,
        );
      });
    }

    doc.end();
    stream.on('finish', () => resolve({ file: filename, path: filePath }));
    stream.on('error', reject);
  });
}

/**
 * 저장된 리포트 목록 조회
 */
function listReports() {
  if (!fs.existsSync(REPORT_DIR)) return [];
  return fs
    .readdirSync(REPORT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const data = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, f), 'utf-8'));
      return {
        file: f,
        period: data.period,
        label: data.label,
        startDate: data.startDate,
        endDate: data.endDate,
        totalTrades: data.summary?.totalTrades,
        totalPnl: data.summary?.totalPnl,
        winRate: data.summary?.winRate,
        generatedAt: data.generatedAt,
      };
    })
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

module.exports = { generateReport, generatePDF, tradesToCSV, listReports, REPORT_DIR };
