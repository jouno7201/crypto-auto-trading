/**
 * API 라우트 - 리포트
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { generateReport, generatePDF, tradesToCSV, listReports, REPORT_DIR } = require('../engine/reportGenerator');

// 리포트 목록 조회
router.get('/', (req, res) => {
  res.json(listReports());
});

// 리포트 생성 (일간/주간/월간)
router.post('/generate', (req, res) => {
  try {
    const { period = 'daily', date } = req.body;
    const report = generateReport(period, date);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 리포트 상세 조회
router.get('/:file', (req, res) => {
  const filePath = path.join(REPORT_DIR, req.params.file);
  if (!filePath.startsWith(REPORT_DIR)) return res.status(400).json({ error: '잘못된 경로' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '리포트 없음' });
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  res.json(data);
});

// CSV 다운로드
router.get('/:file/csv', (req, res) => {
  const filePath = path.join(REPORT_DIR, req.params.file);
  if (!filePath.startsWith(REPORT_DIR)) return res.status(400).json({ error: '잘못된 경로' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '리포트 없음' });

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const csv = tradesToCSV(data.trades || []);

  const csvFilename = req.params.file.replace('.json', '.csv');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${csvFilename}"`);
  // UTF-8 BOM for Excel compatibility
  res.send('\uFEFF' + csv);
});

// PDF 다운로드
router.get('/:file/pdf', async (req, res) => {
  try {
    const filePath = path.join(REPORT_DIR, req.params.file);
    if (!filePath.startsWith(REPORT_DIR)) return res.status(400).json({ error: '잘못된 경로' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '리포트 없음' });

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const result = await generatePDF(data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.file}"`);
    const pdfStream = fs.createReadStream(result.path);
    pdfStream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
