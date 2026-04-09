/**
 * JWT 인증 미들웨어
 * - API_TOKEN 환경변수: 간단한 Bearer 토큰 인증
 * - JWT_SECRET 환경변수: JWT 기반 인증 (선택)
 * - AUTH_ENABLED=false 시 인증 비활성화 (개발용)
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '';
const API_TOKEN = process.env.API_TOKEN || '';
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';

/**
 * API 인증 미들웨어
 * Authorization: Bearer <token>
 */
function authenticate(req, res, next) {
  if (!AUTH_ENABLED) return next();

  // JWT_SECRET도 API_TOKEN도 설정 안 됐으면 인증 건너뜀
  if (!JWT_SECRET && !API_TOKEN) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다' });
  }

  const token = authHeader.slice(7);

  // 1) 고정 API 토큰 비교
  if (API_TOKEN && token === API_TOKEN) {
    req.user = { role: 'admin', method: 'api-token' };
    return next();
  }

  // 2) JWT 검증
  if (JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ error: '유효하지 않은 토큰입니다' });
    }
  }

  return res.status(401).json({ error: '유효하지 않은 토큰입니다' });
}

/**
 * JWT 토큰 생성 (로그인 또는 초기 발급용)
 */
function generateToken(payload = {}, expiresIn = '24h') {
  if (!JWT_SECRET) throw new Error('JWT_SECRET이 설정되지 않았습니다');
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * WebSocket 인증 검증
 * ws 연결 시 URL query 또는 첫 메시지로 토큰 전달
 */
function authenticateWs(req) {
  if (!AUTH_ENABLED) return { authenticated: true, user: { role: 'admin' } };
  if (!JWT_SECRET && !API_TOKEN) return { authenticated: true, user: { role: 'admin' } };

  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    return { authenticated: false, error: '토큰이 필요합니다' };
  }

  // 고정 API 토큰
  if (API_TOKEN && token === API_TOKEN) {
    return { authenticated: true, user: { role: 'admin', method: 'api-token' } };
  }

  // JWT 검증
  if (JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return { authenticated: true, user: decoded };
    } catch {
      return { authenticated: false, error: '유효하지 않은 토큰' };
    }
  }

  return { authenticated: false, error: '유효하지 않은 토큰' };
}

module.exports = { authenticate, generateToken, authenticateWs };
