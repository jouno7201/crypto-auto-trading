// uuid v13은 ESM-only → Jest CJS 환경에서 사용 불가
// crypto.randomUUID()로 대체 모킹
module.exports = {
  v4: () => require('crypto').randomUUID(),
};
