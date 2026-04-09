/**
 * API 엔드포인트 통합 테스트 (supertest 없이 직접 HTTP)
 * - 주요 라우트 응답 검증
 * - 에러 핸들러 (404, 잘못된 요청)
 */

process.env.AUTH_ENABLED = 'false';
process.env.TRADING_MODE = 'paper';
process.env.NODE_ENV = 'test';

const http = require('http');

let server;
let baseUrl;

beforeAll((done) => {
  const { app } = require('../src/index');
  server = app.listen(0, () => {
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
    done();
  });
});

afterAll((done) => {
  if (server) server.close(done);
  else done();
});

function fetch(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`${baseUrl}${path}`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      })
      .on('error', reject);
  });
}

describe('API 엔드포인트', () => {
  test('GET /api/strategies — 200 + 전략 목록', async () => {
    const res = await fetch('/api/strategies');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('name');
  });

  test('GET /api/trades — 200 + 배열', async () => {
    const res = await fetch('/api/trades');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/trades/orders — 200', async () => {
    const res = await fetch('/api/trades/orders');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/assets — 200 + 자산 정보', async () => {
    const res = await fetch('/api/assets');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('capital');
    expect(res.body).toHaveProperty('mode');
  });

  test('GET /api/assets/bot — 200 + 봇 상태', async () => {
    const res = await fetch('/api/assets/bot');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('running');
    expect(res.body).toHaveProperty('strategy');
  });

  test('GET /api/reports — 200', async () => {
    const res = await fetch('/api/reports');
    expect(res.status).toBe(200);
  });

  test('GET /nonexistent — 404', async () => {
    const res = await fetch('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
  });
});
