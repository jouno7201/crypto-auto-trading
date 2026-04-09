# 📋 코인 자동매매 시스템 — 작업 목록

> 마지막 업데이트: 2026-04-09  
> 최신 커밋: `80b9d39` (앙상블 전략 + 페이퍼 트레이딩 설정 + 전략 추천)

---

## ✅ 완료된 작업

- [x] 프로젝트 초기 세팅 (Express, WebSocket, JSON Store)
- [x] Upbit/Binance API 연동 (시세 조회, 캔들 수집)
- [x] 10개 전략 구현 (MA Cross, RSI, Bollinger, MACD, VolBreakout, TripleEMA, Combo, MeanReversion, AdaptiveMomentum, Ensemble)
- [x] 백테스트 엔진 v2 (ATR SL/TP, 트레일링, 슬리피지, 쿨다운)
- [x] 워크포워드 검증 엔진 (in-sample → out-of-sample)
- [x] 시장 상태 감지기 (ADX 기반 trending/ranging/volatile)
- [x] 앙상블 전략 (MACD + MeanReversion 동적 가중치)
- [x] 페이퍼 트레이딩 모드 (executor.js paper/live)
- [x] 대시보드 (LightweightCharts, WebSocket 실시간)
- [x] 리포트 생성 (일간/주간/월간, CSV/PDF)
- [x] Discord 웹훅 알림
- [x] CLI 도구 (backtest.js, trade.js)
- [x] RECOMMENDED 전략 목록 API
- [x] 리스크 관리 (일일 손실 한도, 포지션 사이징)

---

## 🔴 우선순위 높음 (P0 — 실거래 전환 전 필수)

### 1. 최신 데이터 워크포워드 재검증

- [ ] 최근 3개월 (2026-01 ~ 2026-04) ensemble 전략 워크포워드 검증
- [ ] MACD, MeanReversion 개별 전략 최신 데이터 검증
- [ ] 결과에 따라 전략 파라미터 재조정

### 2. API 보안 강화

- [ ] Express API 라우트에 JWT 인증 미들웨어 추가
- [ ] WebSocket 연결 인증 (토큰 기반)
- [ ] API Rate Limiting 적용 (express-rate-limit)
- [ ] CORS 설정 (허용 origin 제한)
- [ ] Helmet.js 보안 헤더 적용

### 3. 에러 핸들링 & 로깅

- [ ] console.log → 구조화된 로거 전환 (winston 또는 pino)
- [ ] 로그 레벨 (debug/info/warn/error) 분리
- [ ] API 에러 응답 표준화 (에러 코드 + 메시지)
- [ ] 미처리 예외(unhandledRejection, uncaughtException) 안전 처리

### 4. 실거래 주문 로직 검증

- [ ] Upbit 주문 API 실제 흐름 테스트 (소액)
- [ ] 주문 실패 → 재시도 로직 검증 (executor.js)
- [ ] 부분 체결 처리 로직
- [ ] Rate Limit 관리 (요청 큐 + 쓰로틀링)
- [ ] 네트워크 장애 시 포지션 보호 로직

---

## 🟡 우선순위 중간 (P1 — 안정성/확장)

### 5. 테스트 코드 작성

- [ ] 전략 유닛 테스트 (Jest) — analyze() 시그널 정확성 검증
- [ ] 백테스트 엔진 테스트 — 알려진 시그널에 대한 올바른 거래 생성
- [ ] 리스크 관리 테스트 — 손절/포지션 한도 정확히 작동
- [ ] API 통합 테스트 — 주요 엔드포인트 응답 검증
- [ ] 워크포워드 검증 테스트

### 6. 멀티마켓 확장

- [ ] ETH, XRP 등 주요 코인 전략 검증
- [ ] 멀티마켓 병렬 트레이딩 봇 (마켓별 독립 인스턴스)
- [ ] 마켓 간 상관관계 분석
- [ ] 마켓별 최적 전략 자동 매칭

### 7. 트레이딩 봇 고도화

- [ ] 봇에 ATR 기반 동적 SL/TP 통합 (현재 고정 % SL/TP)
- [ ] 부분 익절 (TP 래더) — 목표가 도달 시 포지션 분할 청산
- [ ] 트레일링 스탑 실시간 적용
- [ ] 봇 자동 재시작 (PM2 또는 프로세스 매니저)
- [ ] 봇 상태 자동 복구 (재시작 시 기존 포지션 복원)

### 8. 대시보드 개선

- [ ] 실시간 PnL 곡선 차트 (equity curve)
- [ ] 워크포워드 결과 시각화
- [ ] 전략 파라미터 편집 UI
- [ ] 거래 상세 내역 뷰어 (진입/청산 가격, 이유)
- [ ] 반응형 모바일 레이아웃
- [ ] 다크 모드

---

## 🟢 우선순위 낮음 (P2 — 고도화)

### 9. 데이터베이스 전환

- [ ] JSON 파일 → SQLite (또는 PostgreSQL) 마이그레이션
- [ ] 인덱스 기반 쿼리 최적화 (거래 내역, 리포트)
- [ ] 대량 데이터 페이지네이션

### 10. 고급 리포트 & 분석

- [ ] 몬테카를로 시뮬레이션 (전략 기대 분포)
- [ ] Sortino / Calmar 비율 추가
- [ ] 드로다운 분석 (기간별, 원인별)
- [ ] 시장 벤치마크 대비 성과 비교 (BTC B&H vs 전략)

### 11. 인프라 & 배포

- [ ] Docker 컨테이너화 (Dockerfile + docker-compose)
- [ ] CI/CD 파이프라인 (GitHub Actions)
- [ ] 클라우드 배포 (AWS EC2/Lightsail 또는 Railway)
- [ ] HTTPS 적용 (Let's Encrypt)
- [ ] 자동 데이터 백업 (일 1회)

### 12. 고급 기능

- [ ] AI/ML 전략 (Python 마이크로서비스 연동)
- [ ] 뉴스/소셜 센티먼트 데이터 피드
- [ ] Binance 주문 실행 지원 (현재 read-only)
- [ ] 거래소 간 차익거래 전략
- [ ] Telegram 봇 알림 추가

---

## 📊 현재 전략 성과 요약

| 전략                   | 3개월 워크포워드 |     판정     | 추천 |
| ---------------------- | :--------------: | :----------: | :--: |
| **Ensemble** (MACD+MR) |      +0.99%      |  ✅ Robust   |  ⭐  |
| **MACD**               |      +0.72%      |   Moderate   |  ⭐  |
| **MeanReversion**      |      +0.57%      |   Moderate   |  ⭐  |
| MA Cross               |        —         |      —       |      |
| RSI                    |        —         | Unprofitable |      |
| Bollinger              |        —         | Unprofitable |      |
| VolBreakout            |        —         | Unprofitable |      |
| TripleEMA              |        —         | Unprofitable |      |
| ComboSignal            |        —         | Unprofitable |      |
| AdaptiveMomentum       |        —         | Unprofitable |      |

> ⚠️ 6개월 검증에서는 모든 전략 수익률 마이너스 (2024 Oct-Dec BTC 급등장 구간 영향)

---

## 🎯 권장 진행 순서

```
P0-1 최신 데이터 재검증 → P0-2 보안 → P0-3 로깅 → P0-4 실거래 검증
→ P1-5 테스트 → P1-7 봇 고도화 → P1-6 멀티마켓 → P1-8 대시보드
→ P2 (필요에 따라)
```
