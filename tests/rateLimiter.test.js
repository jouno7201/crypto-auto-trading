/**
 * Rate Limiter 유닛 테스트
 * - 토큰 버킷 동작 검증
 * - 큐잉/쓰로틀링
 */

const { RateLimiter } = require('../src/utils/rateLimiter');

describe('RateLimiter', () => {
  test('초기 토큰 수만큼 즉시 실행', async () => {
    const limiter = new RateLimiter(3, 3);
    const results = [];
    const start = Date.now();

    await Promise.all([
      limiter.schedule(() => results.push(1)),
      limiter.schedule(() => results.push(2)),
      limiter.schedule(() => results.push(3)),
    ]);

    expect(results).toHaveLength(3);
    expect(Date.now() - start).toBeLessThan(500); // 빠르게 처리
  });

  test('토큰 소진 시 대기 후 실행', async () => {
    const limiter = new RateLimiter(2, 10); // 2개 즉시, 초당 10개 보충
    const times = [];

    const start = Date.now();
    // 3개 요청: 2개 즉시 + 1개 대기
    await Promise.all([
      limiter.schedule(() => times.push(Date.now() - start)),
      limiter.schedule(() => times.push(Date.now() - start)),
      limiter.schedule(() => times.push(Date.now() - start)),
    ]);

    expect(times).toHaveLength(3);
    // 처음 2개는 즉시(<100ms), 3번째는 약 100ms 대기
    expect(times[0]).toBeLessThan(200);
    expect(times[1]).toBeLessThan(200);
  });

  test('에러 발생 시 reject 전파', async () => {
    const limiter = new RateLimiter(5, 5);
    await expect(
      limiter.schedule(() => {
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');
  });

  test('async 함수 반환값 전달', async () => {
    const limiter = new RateLimiter(5, 5);
    const result = await limiter.schedule(async () => 42);
    expect(result).toBe(42);
  });

  test('순서 보장 (FIFO)', async () => {
    const limiter = new RateLimiter(1, 100); // 1개만 즉시, 빠른 보충
    const order = [];

    await Promise.all([
      limiter.schedule(() => order.push('a')),
      limiter.schedule(() => order.push('b')),
      limiter.schedule(() => order.push('c')),
    ]);

    expect(order).toEqual(['a', 'b', 'c']);
  });
});
