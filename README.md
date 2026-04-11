# 🪙 코인 자동매매 시스템

> Node.js 기반 암호화폐 자동매매 시스템 — 업비트(Upbit) API 연동, 11개 전략(퍼지 시장감지 v2), 워크포워드 검증 백테스트 엔진, 실시간 대시보드

---

## 📋 주요 기능 요약

| 카테고리 | 수량 |
|----------|------|
| 트레이딩 전략 | 11개 (추천 3 · 범용 5 · 폐기 3) |
| 기술 지표 | 8종 (SMA, EMA, RSI, BB, MACD, ATR, Stochastic, ADX) |
| 엔진 모듈 | 13개 (봇, 백테스트, 워크포워드, 리스크, 몬테카를로 등) |
| REST API | 40+ 엔드포인트 |
| WebSocket 명령 | 9종 |
| 알림 채널 | Discord |
| 데이터 저장소 | JSON + SQLite 하이브리드 |
| CLI 도구 | 2 (backtest, trade) |

---

## 🤖 자동매매 봇

- **멀티 봇 매니저** — 여러 마켓 독립 운용 (추가/삭제/개별 시작·정지)
- 업비트 거래소 연동 (REST + WebSocket 실시간 틱)
- **페이퍼/실거래 모드 전환** (`TRADING_MODE=paper|live`)
- 매 틱 사이클: 캔들 수집 → 시장감지 → 리스크 체크 → 전략 시그널 → 주문 실행
- ATR 기반 동적 손절/익절 + 트레일링 스탑 + 분할 익절 래더
- 대시보드/API/CLI에서 코인·전략·봉단위 실시간 변경
- 연속 에러 5회 → 자동 정지 + Discord 알림
- 포지션 상태 자동 저장/복원 (5분 주기)

---

## 📈 트레이딩 전략 (11개)

### ⭐ 추천 전략

| 전략 | 버전 | 설명 | 핵심 특징 |
|------|------|------|-----------|
| **Ensemble** | v2 | MACD + MeanReversion 동적 혼합 | ADX 기반 퍼지 가중치 보간, 신뢰도 필터, 충돌 해소 |
| **MACD** | v4 | MACD 시그널 교차 + 시장상태 연동 | 횡보장 감쇠, 히스토그램 ATR 크기 검증, slow=21/signal=7 |
| **Smart Range** | v1 | 횡보장 전용 레인지 트레이딩 | 피벗 S/R 클러스터링, 지지/저항 바운스, 브레이크아웃 자동 중립 |

### 범용 전략

| 전략 | 버전 | 설명 | 핵심 지표 |
|------|------|------|-----------|
| **MA Cross** | v3 | EMA 9/21 골든/데드크로스 | 풀백 매수, 모멘텀 확장, EMA 100 필터 |
| **RSI** | v3 | 과매수/과매도 반전 | 듀얼 RSI(14+6), 다이버전스, 50선 교차 |
| **Bollinger Band** | v3 | 볼린저 밴드 돌파/반전 | 스퀴즈 브레이크아웃, %B 진입, 밴드 확장 |
| **Mean Reversion** | v2 | 횡보장 평균회귀 | 켈트너 채널 + RSI, 추세장 필터(ADX>30), 볼륨 확인 |
| **Combo Signal** | v3 | RSI+BB+MACD+EMA 복합 | 가중 합산 점수, 비대칭 매수/매도 임계값 |

### 폐기(Deprecated) 전략

| 전략 | 사유 |
|------|------|
| Volatility Breakout | OOS 손실 |
| Triple EMA | 성과 미달 |
| Adaptive Momentum | 성과 미달 |

---

## 🔍 시장 상태 감지기 v2

전략 실행 전 자동으로 시장 환경을 판별합니다:

| 기능 | 설명 |
|------|------|
| **상태 분류** | trending-up / trending-down / ranging / volatile |
| **퍼지 신뢰도** | 0~1 연속값 (이산 분류 대신 확률적 판단) |
| **ADX 속도** | rising / falling / flat (5봉 기반 기울기) |
| **DI 비율** | 방향성 품질 측정 (+DI / -DI 비율) |
| **S/R 레인지 경계** | 피벗 기반 자동 지지/저항선 추출 (상한·하한·중간·폭%) |
| **초기 추세 감지** | ADX 20~25 + rising + diRatio > 0.3 → 조기 포착 |

---

## 📊 백테스트 엔진 v2

- **ATR 기반 동적 손절/익절/트레일링 스탑**
- **분할 매수** (기본 20%, 1~100%)
- **숏(공매도) 지원** — 마진 기반 정확한 손익 계산
- 시장 상태 연동 — 변동성장 SL 확대(1.3×), 추세장 트레일링 축소(0.85×)
- 쿨다운 (손절 후 N봉 재진입 금지)
- 연속 손실 제한 · 일일 최대 손실 한도
- 상세 거래 로그 (진입/청산 사유, 방향, strength)
- 에퀴티 커브 · Sharpe/MDD/승률/PF 자동 계산

### 백테스트 파라미터

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `riskPerTrade` | 0.2 (20%) | 1회 투자 비율 |
| `stopLossATR` | 2.0 | ATR × N 손절 |
| `takeProfitATR` | 3.0 | ATR × N 익절 |
| `trailingStopATR` | 2.5 | ATR × N 트레일링 스탑 |
| `allowShort` | false | 숏(공매도) 허용 |
| `useMarketDetector` | true | 시장 상태 감지기 사용 |
| `cooldownBars` | 3 | 손절 후 대기 봉 수 |
| `maxConsecutiveLoss` | 5 | 연속 손실 제한 |
| `minHoldBars` | 0 | 최소 보유 봉 수 |

---

## 🔄 워크포워드 검증

과적합 방지를 위한 실전급 전략 검증 시스템:

- **N개 롤링 윈도우** train/test 분할
- **그리드 서치 파라미터 최적화** (엔진 파라미터 + 전략 파라미터)
- 전략별 기본 탐색 그리드 내장 (MACD: slowPeriod[18,21,24], signalPeriod[5,7,9] 등)
- 최적화 지표: Sharpe, Return, **Calmar** 비율 선택 가능
- IS vs OOS 수익률 비교 → 과적합 분석
- 진행률 콜백 지원

---

## 📉 고급 분석

| 기능 | 설명 |
|------|------|
| **몬테카를로 시뮬레이션** | 1000회 부트스트랩, 분포 통계, 파산 확률, 히스토그램 |
| **고급 지표** | Sharpe · Sortino · Calmar · Profit Factor · Expectancy |
| **드로다운 분석** | 기간별 누적 추적, 최대 낙폭(MDD) |
| **벤치마크 비교** | 전략 수익률 vs BTC 단순 보유 |
| **상관관계 분석** | 다중 마켓 Pearson 상관행렬, 연환산 변동성, 분산 점수 |
| **포트폴리오 추천** | 탐욕적 최저 상관 선택 (최대 N 마켓) |
| **전략 매칭** | 8개 전략 빠른 백테스트 → 복합 점수 순위 |

---

## 🖥️ 실시간 대시보드

- **실시간 시세** — Upbit WebSocket 틱 스트리밍
- **차트** — LightweightCharts (반응형 높이, CSS clamp)
- **봇 제어** — 시작/중지/설정/멀티봇 관리
- **포트폴리오** — 총 자본, 포지션 가치, 미실현 손익
- **백테스트 UI** — 파라미터 조절 + 결과 시각화
- **리포트** — JSON/CSV/PDF 조회 및 다운로드
- **토스트 알림/로딩 스피너** — UX 피드백
- **WS 연결 상태 표시** — 실시간 네트워크 상태
- **카드 부가정보** — 고가/저가, 현금/포지션, PnL%/거래량

---

## 🛡️ 리스크 관리 시스템

| 기능 | 설명 |
|------|------|
| **포지션 크기 제한** | 건당 30%, 총 노출 90% |
| **고정비율 리스크** | 자본의 2% 리스크 기반 사이징 |
| **일일 최대 손실** | 5% 초과 시 거래 중단 |
| **ATR 동적 SL/TP** | 변동성장 SL 1.3×, 추세장 트레일링 0.85× |
| **분할 익절 래더** | ATR×2 → 33%, ATR×3.5 → 33%, 잔여 → 트레일링/최종 TP |
| **쿨다운** | 손절 후 N봉 재진입 금지 |
| **연속 손실 제한** | N회 연속 손실 시 거래 중단 |
| **ATR 없을 때** | 고정 % 폴백 |

---

## 📡 API 엔드포인트

### 봇 & 자산

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 헬스체크 |
| GET | `/api/assets` | 자본, 포지션 가치, 미실현 손익 |
| GET | `/api/assets/bot` | 봇 상태 |
| POST | `/api/assets/bot/start` | 봇 시작 |
| POST | `/api/assets/bot/stop` | 봇 중지 |
| POST | `/api/assets/bot/configure` | 봇 설정 변경 |

### 멀티봇

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/assets/portfolio` | 멀티봇 포트폴리오 |
| GET | `/api/assets/bots` | 전체 봇 상태 |
| POST | `/api/assets/bots/add` | 봇 추가 |
| DELETE | `/api/assets/bots/:market` | 봇 삭제 |
| POST | `/api/assets/bots/:market/start` | 개별 시작 |
| POST | `/api/assets/bots/:market/stop` | 개별 중지 |
| POST | `/api/assets/bots/start-all` | 전체 시작 |
| POST | `/api/assets/bots/stop-all` | 전체 중지 |
| POST | `/api/assets/bots/:market/configure` | 개별 설정 |

### 백테스트 & 분석

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/assets/backtest` | 백테스트 결과 목록 |
| POST | `/api/assets/backtest/run` | 백테스트 실행 |
| POST | `/api/assets/backtest/walk-forward` | 워크포워드 검증 |
| GET | `/api/assets/backtest/:file` | 결과 상세 |
| POST | `/api/assets/analysis/correlation` | 상관관계 행렬 |
| POST | `/api/assets/analysis/recommend-portfolio` | 포트폴리오 추천 |
| POST | `/api/assets/analysis/match-strategy` | 전략 매칭 |
| POST | `/api/assets/analysis/match-all` | 전략 일괄 매칭 |
| POST | `/api/assets/analysis/monte-carlo` | 몬테카를로 시뮬레이션 |
| GET | `/api/assets/analysis/metrics` | Sortino/Calmar 지표 |
| GET | `/api/assets/analysis/drawdown` | 드로다운 분석 |
| GET | `/api/assets/analysis/benchmark` | 벤치마크 비교 |

### 전략 & 거래 & 리포트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/strategies` | 전략 목록 (파라미터, 추천 여부) |
| POST | `/api/strategies/:id/toggle` | 전략 ON/OFF |
| PUT | `/api/strategies/:id/params` | 파라미터 수정 |
| GET | `/api/trades` | 거래 내역 (페이지네이션) |
| GET | `/api/trades/stats` | 거래 통계 |
| GET | `/api/trades/orders` | 주문 로그 |
| GET | `/api/reports` | 리포트 목록 |
| POST | `/api/reports/generate` | 일간/주간/월간 리포트 생성 |
| GET | `/api/reports/:file/csv` | CSV 다운로드 |
| GET | `/api/reports/:file/pdf` | PDF 다운로드 |

### WebSocket 명령

`startBot` · `stopBot` · `getStatus` · `configBot` · `addBot` · `removeBot` · `startAllBots` · `stopAllBots` · `getPortfolio`

---

## 🔌 거래소 연동

| 거래소 | 용도 | 기능 |
|--------|------|------|
| **Upbit** | 메인 거래소 | JWT 인증, 캔들/틱/계좌 조회, 시장가/지정가 주문, WebSocket 실시간 시세 |

---

## 💾 데이터 저장

- **하이브리드 스토어** — SQLite (거래/주문) + JSON (설정/캔들/백테스트)
- **SQLite** — better-sqlite3, WAL 모드, 인덱스, 페이지네이션, 집계 통계
- **KV 스토어** — 설정, 백테스트 결과, 캔들 캐시
- **자동 폴백** — SQLite 불가 시 순수 JSON 모드

---

## 🔒 보안

| 계층 | 구현 |
|------|------|
| **인증** | Bearer API Token + JWT (발급/검증, 비활성화 가능) |
| **HTTP 헤더** | Helmet (CSP, X-Frame-Options 등) |
| **CORS** | 허용 Origin 화이트리스트 (`CORS_ORIGINS`) |
| **Rate Limiting** | 전역 100req/min, 무거운 작업 5req/min |
| **WebSocket 인증** | URL 쿼리 `?token=` |

---

## 📢 알림

| 채널 | 알림 내용 |
|------|-----------|
| **Discord** | 매수/매도, 봇 시작/중지, 에러, 일일 리포트 (Rich Embed) |


---

## 🚀 빠른 시작

### 1. 설치

```bash
git clone https://github.com/jouno7201/crypto-auto-trading.git
cd crypto-auto-trading
npm install
```

### 2. 환경 설정

```bash
cp .env.example .env
# .env 파일 편집
```

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | 3008 | 서버 포트 |
| `TRADING_MODE` | paper | `paper`(모의) 또는 `live`(실거래) |
| `UPBIT_ACCESS_KEY` | — | 업비트 API 키 |
| `UPBIT_SECRET_KEY` | — | 업비트 시크릿 키 |
| `BOT_MARKET` | KRW-BTC | 대상 마켓 |
| `BOT_STRATEGY` | ensemble | 전략 이름 |
| `BOT_UNIT` | 60 | 봉 단위 (분) |
| `BOT_INTERVAL` | 60000 | 틱 주기 (ms) |
| `BOT_CAPITAL` | 1000000 | 초기 자본 (KRW) |
| `AUTH_ENABLED` | true | 인증 활성화 |
| `API_TOKEN` | — | API 토큰 |
| `JWT_SECRET` | — | JWT 시크릿 |
| `DISCORD_WEBHOOK_URL` | — | Discord 웹훅 |
| `ML_SERVICE_URL` | — | ML 서비스 URL |

### 3. 실행

```bash
# 서버 실행
npm start

# 개발 모드 (자동 재시작)
npm run dev

# CLI 백테스트
npm run backtest

# CLI 매매
npm run trade
```

대시보드: **http://localhost:3008**

---

##  프로젝트 구조

```
crypto-auto-trading/
├── src/
│   ├── index.js                  # Express 서버 진입점
│   ├── api/
│   │   └── upbit.js              # 업비트 API (JWT, 주문, 캔들)
│   ├── engine/
│   │   ├── tradingBot.js         # 자동매매 봇 코어
│   │   ├── botManager.js         # 멀티봇 매니저
│   │   ├── backtest.js           # 백테스트 엔진 v2
│   │   ├── walkForward.js        # 워크포워드 검증
│   │   ├── executor.js           # 주문 실행 (페이퍼/실거래)
│   │   ├── riskManager.js        # 리스크 관리
│   │   ├── dataCollector.js      # 캔들 수집 + WebSocket 틱
│   │   ├── advancedAnalysis.js   # 몬테카를로/고급 지표
│   │   ├── correlationAnalyzer.js# 상관분석/포트폴리오 추천
│   │   ├── strategyMatcher.js    # 전략 자동 매칭
│   │   ├── reportGenerator.js    # 리포트 (CSV/PDF)
│   │   ├── notifier.js           # Discord 알림
│   │   └── mlBridge.js           # ML 서비스 연동
│   ├── strategies/
│   │   ├── BaseStrategy.js       # 전략 베이스 클래스
│   │   ├── EnsembleStrategy.js   # ⭐ Ensemble v2
│   │   ├── MACDStrategy.js       # ⭐ MACD v4
│   │   ├── SmartRange.js         # ⭐ SmartRange v1
│   │   ├── MeanReversion.js      # MeanReversion v2
│   │   ├── MACross.js            # MA Cross v3
│   │   ├── RSIStrategy.js        # RSI v3
│   │   ├── BollingerBand.js      # Bollinger Band v3
│   │   ├── ComboSignal.js        # Combo Signal v3
│   │   ├── VolatilityBreakout.js # (deprecated)
│   │   ├── TripleEMA.js          # (deprecated)
│   │   ├── AdaptiveMomentum.js   # (deprecated)
│   │   ├── indicators.js         # 기술 지표 8종
│   │   ├── marketDetector.js     # 시장 감지기 v2
│   │   └── index.js              # 전략 레지스트리
│   ├── routes/                   # REST API 라우트
│   ├── store/                    # JSON + SQLite 하이브리드
│   ├── middleware/               # Auth, Error Handler
│   ├── dashboard/                # SPA 대시보드
│   ├── utils/                    # Logger, RateLimiter
│   └── cli/                      # CLI (backtest, trade)
├── scripts/
│   ├── backup.sh                 # 데이터 백업 (cron)
│   ├── migrate-to-sqlite.js      # JSON→SQLite 마이그레이션
│   ├── ml_service.py             # ML 마이크로서비스 (Flask)
│   └── walkforward-revalidate.js # 워크포워드 일괄 재검증
├── tests/                        # Jest 테스트
└── package.json
```

---

## 🧪 테스트

```bash
# 전체 테스트
npm test

# 감시 모드
npm run test:watch
```

110+ 테스트 (Jest v30) — 전략, 봇, 리스크매니저, 백테스트, API, SQLite, Rate Limiter 등

---

## 🛠️ 스크립트

| 스크립트 | 설명 |
|----------|------|
| `scripts/backup.sh` | `data/` 일일 백업 (tar.gz), 7일 이상 자동 삭제 |
| `scripts/migrate-to-sqlite.js` | JSON → SQLite 마이그레이션 (비파괴적) |
| `scripts/ml_service.py` | Flask ML 서비스 (예측/감성분석/학습) |
| `scripts/walkforward-revalidate.js` | 4개 전략 워크포워드 일괄 검증 |

---

## ⚠️ 면책 조항

이 소프트웨어는 교육 및 연구 목적으로 제작되었습니다. 실제 거래에 사용할 경우 발생하는 모든 손실에 대한 책임은 사용자에게 있습니다. 암호화폐 투자는 원금 손실의 위험이 있으며, 과거 백테스트 성과가 미래 수익을 보장하지 않습니다.

---

## 📜 라이선스

MIT License
