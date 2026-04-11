# 📋 대시보드 UI 기능 개선 — 작업 목록

> 마지막 업데이트: 2026-04-11

---

## 1단계: 봇 설정 서버 동기화 ✅

- [x] TradingTab 마운트 시 `GET /api/assets/bot`으로 실제 봇 설정 로드
- [x] 서버 반환값(market, strategyName, unit)을 BotPanel 초기값으로 반영
- [x] WS `botStatus` 메시지 수신 시에도 설정 동기화

## 2단계: 전략 파라미터 편집 UI ✅

- [x] `GET /api/strategies`로 전략 목록 + 현재 파라미터 로드
- [x] 전략별 파라미터 인라인 편집 폼 (숫자 input)
- [x] `PUT /api/strategies/:id/params`로 저장
- [x] 수정 성공/실패 토스트 피드백

## 3단계: 리포트 기간 선택 UI ✅

- [x] 현재 하드코딩된 `{ period: 'daily' }` → 드롭다운으로 daily/weekly/monthly 선택
- [x] 선택값을 `POST /api/reports/generate` 요청에 반영

## 4단계: 거래 내역 필터/페이지네이션 ✅

- [x] 마켓(market), 타입(buy/sell) 필터 드롭다운 추가
- [x] 페이지네이션 컨트롤 (이전/다음, 현재 페이지/총 페이지)
- [x] `GET /api/trades?market=&type=&page=&limit=` 쿼리 파라미터 연동

## 5단계: 멀티봇 관리 UI ✅

- [x] 새 탭으로 멀티봇 현황 표시 (`GET /api/assets/bots`)
- [x] 봇 추가 폼 (마켓/전략/봉 선택 → `POST /api/assets/bots/add`)
- [x] 개별 봇 시작/정지/제거 버튼
- [x] 전체 시작/전체 정지 버튼
