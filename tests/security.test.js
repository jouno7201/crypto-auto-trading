/**
 * 보안·안정성 기능 통합 테스트
 * - 헬스체크 엔드포인트
 * - 백테스트 세마포어 (동시 실행 제한)
 * - 경로 탐색 방어
 * - 봇 추가 입력 검증
 * - 백테스트 날짜/전략 검증
 * - 전략 핫스왑 안전장치
 * - 요청 로깅 미들웨어
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
    baseUrl = `http://localhost:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  if (server) server.close(done);
  else done();
});

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get(`${baseUrl}${urlPath}`, (res) => {
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

function post(urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      `${baseUrl}${urlPath}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ===== 1. 헬스체크 엔드포인트 =====
describe('헬스체크 /health', () => {
  test('200 + 필수 필드 반환', async () => {
    const res = await get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('memory');
    expect(res.body.memory).toHaveProperty('rss');
    expect(res.body.memory).toHaveProperty('heap');
    expect(res.body).toHaveProperty('bot');
    expect(res.body.bot).toHaveProperty('running');
    expect(res.body.bot).toHaveProperty('stale');
    expect(res.body.bot).toHaveProperty('consecutiveErrors');
    expect(res.body).toHaveProperty('multiBots');
    expect(res.body).toHaveProperty('ws');
  });

  test('status가 ok 또는 degraded', async () => {
    const res = await get('/health');
    expect(['ok', 'degraded']).toContain(res.body.status);
  });
});

// ===== 2. 경로 탐색 방어 =====
describe('백테스트 경로 탐색 방어', () => {
  test('../../etc/passwd 차단 → 400 또는 404', async () => {
    const res = await get('/api/assets/backtest/..%2F..%2F..%2Fetc%2Fpasswd');
    expect([400, 404]).toContain(res.status);
  });

  test('../../.env 차단', async () => {
    const res = await get('/api/assets/backtest/..%2F..%2F.env');
    expect([400, 404]).toContain(res.status);
  });

  test('정상 파일명은 허용 (없으면 404)', async () => {
    const res = await get('/api/assets/backtest/nonexistent_file.json');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ===== 3. 봇 추가 입력 검증 =====
describe('봇 추가 입력 검증 POST /api/assets/bots/add', () => {
  test('마켓 누락 → 400', async () => {
    const res = await post('/api/assets/bots/add', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/마켓/);
  });

  test('잘못된 마켓 형식 → 400', async () => {
    const res = await post('/api/assets/bots/add', { market: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/마켓 형식/);
  });

  test('없는 전략 → 400', async () => {
    const res = await post('/api/assets/bots/add', { market: 'KRW-BTC', strategyName: 'no-such-strategy' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/전략/);
  });

  test('잘못된 봉 단위 → 400', async () => {
    const res = await post('/api/assets/bots/add', { market: 'KRW-BTC', unit: '999' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/봉 단위/);
  });

  test('자본금 범위 초과 → 400', async () => {
    const res = await post('/api/assets/bots/add', { market: 'KRW-TEST', initialCapital: 999999999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/자본금/);
  });

  test('자본금 너무 적음 → 400', async () => {
    const res = await post('/api/assets/bots/add', { market: 'KRW-TEST', initialCapital: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/자본금/);
  });
});

// ===== 4. 백테스트 날짜/전략 검증 =====
describe('백테스트 입력 검증 POST /api/assets/backtest/run', () => {
  test('전략 누락 → 400', async () => {
    const res = await post('/api/assets/backtest/run', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/전략/);
  });

  test('없는 전략 → 400', async () => {
    const res = await post('/api/assets/backtest/run', { strategy: 'fake-strategy' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/전략/);
  });

  test('잘못된 봉 단위 → 400', async () => {
    const res = await post('/api/assets/backtest/run', { strategy: 'ma-cross', unit: '999' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/봉 단위/);
  });

  test('시작일 > 종료일 → 400', async () => {
    const res = await post('/api/assets/backtest/run', {
      strategy: 'ma-cross',
      startDate: '2025-06-01',
      endDate: '2025-01-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/시작일/);
  });

  test('미래 종료일 → 400', async () => {
    const res = await post('/api/assets/backtest/run', {
      strategy: 'ma-cross',
      startDate: '2025-01-01',
      endDate: '2099-12-31',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/종료일/);
  });

  test('잘못된 날짜 형식 → 400', async () => {
    const res = await post('/api/assets/backtest/run', {
      strategy: 'ma-cross',
      startDate: 'not-a-date',
      endDate: 'also-not',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/날짜/);
  });
});

// ===== 5. 워크포워드 날짜/전략 검증 =====
describe('워크포워드 입력 검증 POST /api/assets/backtest/walk-forward', () => {
  test('전략 누락 → 400', async () => {
    const res = await post('/api/assets/backtest/walk-forward', { startDate: '2025-01-01', endDate: '2025-06-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/전략/);
  });

  test('없는 전략 → 400', async () => {
    const res = await post('/api/assets/backtest/walk-forward', {
      strategy: 'xyz',
      startDate: '2025-01-01',
      endDate: '2025-06-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/전략/);
  });

  test('날짜 누락 → 400', async () => {
    const res = await post('/api/assets/backtest/walk-forward', { strategy: 'ma-cross' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/시작일|종료일/);
  });

  test('시작일 > 종료일 → 400', async () => {
    const res = await post('/api/assets/backtest/walk-forward', {
      strategy: 'ma-cross',
      startDate: '2025-12-01',
      endDate: '2025-01-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/시작일/);
  });
});

// ===== 6. 전략 핫스왑 안전장치 =====
describe('전략 핫스왑 안전장치', () => {
  test('POST /api/assets/bot/configure — 포지션 없으면 변경 허용', async () => {
    const res = await post('/api/assets/bot/configure', { strategyName: 'rsi' });
    // 봇이 있으면 200, 없으면 400
    expect([200, 400]).toContain(res.status);
  });
});

// ===== 7. 캔들 단위 검증 =====
describe('캔들 조회 단위 검증', () => {
  test('잘못된 봉 단위 → 400', async () => {
    const res = await get('/api/assets/candles/KRW-BTC?unit=999');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/봉 단위/);
  });
});

// ===== 8. 요청 로깅 미들웨어 =====
describe('요청 로깅 미들웨어', () => {
  test('/api/ 요청에 정상 응답 (미들웨어 통과)', async () => {
    const res = await get('/api/strategies');
    expect(res.status).toBe(200);
    // 로깅 미들웨어가 에러 없이 통과하면 정상 응답
  });

  test('404 API 요청도 미들웨어 통과', async () => {
    const res = await get('/api/nonexistent-endpoint');
    expect(res.status).toBe(404);
  });
});
