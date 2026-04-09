/**
 * API 에러 핸들링 미들웨어
 * - 표준화된 에러 응답 포맷
 * - 미처리 라우트 404
 * - 전역 에러 핸들러
 */

const { createLogger } = require('../utils/logger');
const log = createLogger('api');

/**
 * 표준 에러 응답 생성
 */
function errorResponse(status, code, message, details) {
  const body = { error: { code, message } };
  if (details) body.error.details = details;
  return { status, body };
}

/**
 * 404 미처리 라우트 핸들러
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `${req.method} ${req.path} 경로를 찾을 수 없습니다` },
  });
}

/**
 * 전역 에러 핸들러 (Express 에러 미들웨어 — 반드시 4개 인자)
 */
function globalErrorHandler(err, req, res, _next) {
  // CORS 에러
  if (err.message && err.message.includes('CORS')) {
    log.warn({ method: req.method, path: req.path, origin: req.headers.origin }, 'CORS 차단');
    return res.status(403).json({
      error: { code: 'CORS_BLOCKED', message: 'CORS 정책에 의해 차단됨' },
    });
  }

  // JSON 파싱 에러
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: '잘못된 JSON 형식입니다' },
    });
  }

  // 기타 에러
  const status = err.status || err.statusCode || 500;
  log.error({ err, method: req.method, path: req.path }, '요청 처리 에러');

  res.status(status).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? '서버 내부 오류가 발생했습니다' : err.message,
    },
  });
}

module.exports = { errorResponse, notFoundHandler, globalErrorHandler };
