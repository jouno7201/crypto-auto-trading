# 🪙 코인 자동매매 시스템

> Node.js 기반 암호화폐 자동매매 시스템 — 업비트(Upbit) API 연동, 7개 전략, 고급 백테스트 엔진, 실시간 대시보드

## 📋 주요 기능

### 🤖 자동매매 봇
- **7개 자동매매 전략** 탑재  
- 업비트 거래소 연동 (REST + WebSocket)
- 페이퍼/실거래 모드 전환 (`TRADING_MODE`)
- 대시보드에서 코인/전략/봉단위 실시간 변경

### 📊 백테스트 엔진 v2
- **동적 손절(ATR-SL)** / 익절(ATR-TP) / 트레일링 스탑
- **분할 매수** (기본 30%, 1~100% 조절 가능)
- **숏(공매도) 지원** — 마진 기반 정확한 손익 계산
- **ADX 시장 상태 감지기** — 추세/횡보 자동 필터링
- 쿨다운 (손절 후 N봉 재진입 금지)
- 연속 손실 제한 (기본 5회)
- 상세 거래 로그 (진입/청산 사유, 방향)

### 🖥️ 실시간 대시보드
- 실시간 시세 (WebSocket)
- 자산 현황 + 차트 (LightweightCharts)
- 백테스트 UI (파라미터 조절 + 결과 시각화)
- 리포트 조회/다운로드 (CSV, PDF)
- 봇 설정 UI (코인/전략/봉단위 선택)

### 📈 7개 트레이딩 전략

| 전략 | 설명 | 핵심 지표 |
|---|---|---|
| **MA Cross** | 이동평균선 교차 | SMA 단기/장기 |
| **RSI** | 과매수/과매도 반전 | RSI 14 |
| **Bollinger Band** | 볼린저 밴드 돌파/반전 | BB 20/2σ |
| **Volatility Breakout** | 변동성 돌파 (래리 윌리엄스) | ATR, Range |
| **MACD** | MACD 시그널 교차 | MACD 12/26/9 |
| **Triple EMA** | 3중 지수이동평균 추세 | EMA 8/21/55 |
| **Combo Signal** | RSI + BB + MACD 복합 | 다중 지표 합산 |

### 🏆 백테스트 최적 조합 (2025-01 ~ 2026-04, KRW-BTC)

| 순위 | 전략 | 봉 | 설정 | 수익률 | MDD | PF |
|---|---|---|---|---|---|---|
| 1 | MA Cross | 60분 | Long+Short 30% | +1.36% | 1.90% | 1.97 |
| 2 | MA Cross | 60분 | Long+Short 50% | +2.25% | 3.15% | 1.95 |
| 3 | Triple EMA | 240분 | Long+Short 넓은SL | +0.64% | 9.09% | 1.04 |
| 4 | MA Cross | 240분 | Long 감지OFF | +0.47% | 2.46% | 1.14 |
| 5 | RSI | 60분 | Long+Short 30% | +0.19% | 2.23% | 1.06 |

> 168개 조합(7전략 × 2타임프레임 × 12설정) 전수 테스트 결과

---

## 🚀 빠른 시작

### 1. 설치

```bash
git clone https://github.com/<your-username>/crypto-auto-trading.git
cd crypto-auto-trading
npm install
```

### 2. 환경 설정

```bash
cp .env.example .env
# .env 파일에 업비트 API 키 입력
```

```env
PORT=3008
UPBIT_ACCESS_KEY=your_key
UPBIT_SECRET_KEY=your_secret
TRADING_MODE=paper    # paper(모의) 또는 live(실거래)
```

### 3. 실행

```bash
# 서버 실행
npm start

# 개발 모드 (자동 재시작)
npm run dev

# CLI 백테스트
npm run backtest
```

대시보드: **http://localhost:3008**

---

## 📁 프로젝트 구조

```
crypto-auto-trading/
├── src/
│   ├── index.js                 # Express 서버 진입점
│   ├── api/
│   │   ├── index.js             # 거래소 API 라우터
│   │   ├── upbit.js             # 업비트 API 클라이언트
│   │   └── binance.js           # 바이낸스 API 클라이언트
│   ├── engine/
│   │   ├── backtest.js          # 백테스트 엔진 v2 (SL/TP/TS/숏/감지기)
│   │   ├── tradingBot.js        # 자동매매 봇 코어
│   │   ├── executor.js          # 주문 실행기
│   │   ├── dataCollector.js     # 캔들 데이터 수집 (Upbit REST)
│   │   ├── riskManager.js       # 리스크 관리
│   │   └── reportGenerator.js   # 리포트 생성 (CSV, PDF)
│   ├── strategies/
│   │   ├── BaseStrategy.js      # 전략 베이스 클래스
│   │   ├── MACross.js           # 이동평균 교차
│   │   ├── RSIStrategy.js       # RSI 과매수/과매도
│   │   ├── BollingerBand.js     # 볼린저 밴드
│   │   ├── VolatilityBreakout.js# 변동성 돌파
│   │   ├── MACDStrategy.js      # MACD 교차
│   │   ├── TripleEMA.js         # 3중 EMA 추세
│   │   ├── ComboSignal.js       # 복합 시그널
│   │   ├── indicators.js        # 기술 지표 (SMA,EMA,RSI,BB,MACD,ATR,ADX...)
│   │   ├── marketDetector.js    # ADX 기반 시장 상태 감지기
│   │   └── index.js             # 전략 레지스트리
│   ├── routes/
│   │   ├── assets.js            # 자산/백테스트/봇 API
│   │   ├── strategies.js        # 전략 목록 API
│   │   ├── trades.js            # 거래 내역 API
│   │   └── reports.js           # 리포트 API (JSON/CSV/PDF)
│   ├── store/
│   │   └── jsonStore.js         # JSON 파일 기반 저장소
│   ├── dashboard/
│   │   └── index.html           # 대시보드 SPA (HTML/CSS/JS)
│   └── cli/
│       ├── backtest.js          # CLI 백테스트 실행
│       └── trade.js             # CLI 수동 매매
├── data/                        # 데이터 저장 (gitignore)
│   ├── candles/                 # 캔들 캐시
│   ├── backtest-results/        # 백테스트 결과
│   ├── reports/                 # 생성된 리포트
│   ├── snapshots/               # 자산 스냅샷
│   ├── bot-state.json           # 봇 상태
│   └── strategies.json          # 전략 설정
├── .env.example                 # 환경변수 예제
├── .gitignore
├── package.json
└── README.md
```

---

## 🔧 백테스트 옵션

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `riskPerTrade` | 0.3 (30%) | 1회 투자 비율 |
| `stopLossATR` | 2.0 | ATR × N 손절 (0=비활성) |
| `takeProfitATR` | 3.0 | ATR × N 익절 (0=비활성) |
| `trailingStopATR` | 2.5 | ATR × N 트레일링 스탑 |
| `allowShort` | false | 숏(공매도) 허용 |
| `useMarketDetector` | true | ADX 시장 상태 감지기 사용 |
| `cooldownBars` | 3 | 손절 후 재진입 대기 봉 수 |
| `maxConsecutiveLoss` | 5 | 연속 손실 제한 |

---

## 📡 API 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | 헬스체크 |
| GET | `/api/strategies` | 전략 목록 |
| GET | `/api/assets/summary` | 자산 요약 |
| GET | `/api/assets/bot` | 봇 상태 |
| POST | `/api/assets/bot/start` | 봇 시작 |
| POST | `/api/assets/bot/stop` | 봇 중지 |
| POST | `/api/assets/bot/configure` | 봇 설정 변경 |
| POST | `/api/assets/backtest/run` | 백테스트 실행 |
| GET | `/api/trades` | 거래 내역 |
| GET | `/api/reports` | 리포트 목록 |
| GET | `/api/reports/:name/pdf` | PDF 다운로드 |

---

## 🛡️ 리스크 관리 시스템

1. **분할 매수** — 전체 자본의 일부만 투자 (기본 30%)
2. **ATR 기반 동적 손절** — 시장 변동성에 맞춘 손절선
3. **트레일링 스탑** — 수익 구간에서 이익 보호
4. **쿨다운** — 손절 후 즉시 재진입 방지
5. **연속 손실 제한** — N회 연속 손실 시 거래 중단
6. **시장 상태 감지** — ADX 기반 추세/횡보 판별, 횡보장 추세전략 필터링

---

## ⚠️ 면책 조항

이 소프트웨어는 교육 및 연구 목적으로 제작되었습니다. 실제 거래에 사용할 경우 발생하는 모든 손실에 대한 책임은 사용자에게 있습니다. 암호화폐 투자는 원금 손실의 위험이 있으며, 과거 백테스트 성과가 미래 수익을 보장하지 않습니다.

---

## 📜 라이선스

MIT License
