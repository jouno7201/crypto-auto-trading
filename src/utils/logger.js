/**
 * 구조화된 로거 (pino 기반)
 * - 로그 레벨: debug / info / warn / error / fatal
 * - 개발: pino-pretty (컬러 콘솔)
 * - 운영: JSON stdout (파일/클라우드 수집 호환)
 * - 자식 로거: module별 context 자동 부여
 */

const pino = require('pino');

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const transport =
  process.env.NODE_ENV === 'production'
    ? undefined // JSON stdout (운영)
    : pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      });

const logger = pino(
  {
    level: LOG_LEVEL,
    base: undefined, // pid, hostname 제거
  },
  transport,
);

/**
 * 모듈별 자식 로거 생성
 * @param {string} module - 모듈 이름 (예: 'bot', 'ws', 'api')
 */
function createLogger(module) {
  return logger.child({ module });
}

module.exports = { logger, createLogger };
