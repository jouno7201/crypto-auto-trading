# 📋 시스템 안정성 개선 — 작업 목록

> 마지막 업데이트: 2026-04-12

---

## 1순위: 안정성 개선 ✅

### 1-1. 헬스체크 엔드포인트 강화 ✅

- [x] `/health` 응답에 봇 상태, WS 클라이언트 수, 메모리, 멀티봇 정보 포함
- [x] 봇이 3분 이상 tick 안 하면 `stale` 판정 → 503 응답
- [x] 연속 에러 5회 이상이면 `degraded` 상태
- [x] Graceful Shutdown 시 WS 클라이언트에게 `shutdown` 메시지 전송

### 1-2. 주문 복구 루프 (크래시 복구) ✅

- [x] 봇 시작 시 `_reconcileOrders()` 호출 → Upbit 미체결 주문 조회
- [x] 미체결 주문 자동 취소 + 부분 체결분 포지션 반영
- [x] 복구 결과 Discord 알림 전송
- [x] 페이퍼 모드에서는 스킵

### 1-3. 대시보드 메모리 누수 수정 ✅

- [x] useWebSocket 언마운트 시 핸들러 완전 정리 (onclose=null → close)
- [x] CLOSING 상태 WS 정리 후 새 연결
- [x] 서버 `shutdown` 메시지 수신 시 재연결 안 함

### 1-4. 대시보드 세션 유지 (localStorage) ✅

- [x] TradingTab 설정(마켓/전략/봉)을 localStorage에 자동 저장
- [x] 새로고침 시 저장된 설정 복원 → 서버 동기화보다 선행

### 1-5. 에러 바운더리 컴포넌트 ✅

- [x] ErrorBoundary 클래스 컴포넌트 생성
- [x] 각 탭을 ErrorBoundary로 래핑 → 한 탭 오류가 전체에 영향 안 줌
- [x] "다시 시도" 버튼으로 복구 가능

### 1-6. PM2 자동 재시작 설정 ✅

- [x] ecosystem.config.js 생성 (메모리 500MB 제한, 자동 재시작, 로그 파일)

---

## 2순위: 데이터 보호 ✅

### 2-1. 전략 파라미터 입력 검증 ✅

- [x] 백엔드: `PUT /strategies/:id/params` — 숫자 타입, 양수, 유한값, 알 수 없는 키 거부
- [x] 백엔드: 교차 검증 (shortPeriod < longPeriod, fastPeriod < slowPeriod)
- [x] 프론트엔드: StrategyEditor 저장 시 동일 검증 + 서버 에러 메시지 표시

### 2-2. 전략 실전 성과 추적 ✅

- [x] SQLite `strategy_stats` 테이블 생성 (strategy+market UNIQUE)
- [x] 매 sell/partial-sell 거래 후 `updateStrategyStats()` 자동 갱신
- [x] `GET /api/strategies/stats` — 전체 전략 성과 조회
- [x] `GET /api/strategies/:id/stats` — 개별 전략 성과 조회

### 2-3. 백테스트 동시 실행 제한 ✅

- [x] 세마포어 기반 동시 실행 2개 제한 (backtest/run + walk-forward)
- [x] 초과 시 429 응답 + 현재 실행 수 반환
- [x] 5분 타임아웃 안전장치

## 3순위: 운영/품질 ✅

### 3-1. 전략 전환 안전장치 ✅

- [x] 포지션 보유 중 전략/마켓 변경 시 에러 throw (409 응답)
- [x] 파라미터만 변경은 허용, 전략·마켓 변경만 차단
- [x] 경고 로그 출력 + 프론트에서 에러 메시지 표시

### 3-2. 요청 로깅 미들웨어 ✅

- [x] `/api/` 전체에 request ID 부여 (r1, r2, ...)
- [x] 응답 완료 시 method, url, status, duration(ms) 로그
- [x] 5xx → error, 4xx → warn, 2xx → info 레벨 자동 분류

### 3-3. 전략 실전 성과 대시보드 ✅

- [x] StrategyStatsPanel 컴포넌트 — 전략별 승률/PnL/최대수익·손실 테이블
- [x] 리포트 탭 하단에 배치
- [x] 최고 성과 전략 ★ 하이라이트
