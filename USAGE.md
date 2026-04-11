# 코인 자동매매 시스템 — 사용 가이드

## 목차

1. [빠른 시작](#빠른-시작)
2. [환경 설정](#환경-설정)
3. [서버 실행](#서버-실행)
4. [대시보드](#대시보드)
5. [봇 운영](#봇-운영)
6. [전략](#전략)
7. [백테스트](#백테스트)
8. [Walk-Forward 분석](#walk-forward-분석)
9. [리포트](#리포트)
10. [CLI 도구](#cli-도구)
11. [API 레퍼런스](#api-레퍼런스)
12. [고급 기능](#고급-기능)
13. [백업](#백업)
14. [문제 해결](#문제-해결)

---

## 빠른 시작

```bash
# 1. 의존성 설치
npm ci

# 2. 대시보드 빌드
npm run dashboard:build

# 3. 환경변수 설정
cp .env.example .env
# .env 파일 편집

# 4. 서버 실행
npm start

# 5. 대시보드 접속
open http://localhost:3008
```

---

## 환경 설정

`.env.example`을 `.env`로 복사 후 아래 항목을 설정합니다.

### 기본 설정

| 변수               | 설명                  | 기본값 |
| ------------------ | --------------------- | ------ |
| `PORT`             | 서버 포트             | `3008` |
| `UPBIT_ACCESS_KEY` | 업비트 API Access Key | (없음) |
| `UPBIT_SECRET_KEY` | 업비트 API Secret Key | (없음) |

### 선택 설정

| 변수                | 설명                         | 기본값                  |
| ------------------- | ---------------------------- | ----------------------- |
| `TRADING_MODE`      | 거래 모드 (`paper` / `live`) | `paper`                 |
| `LOG_LEVEL`         | 로그 레벨                    | `info`                  |
| `CORS_ORIGINS`      | 허용 도메인 (쉼표 구분)      | `http://localhost:3008` |
| `RATE_LIMIT_GLOBAL` | 전체 요청 제한 (분당)        | `100`                   |
| `RATE_LIMIT_HEAVY`  | 무거운 작업 제한 (분당)      | `5`                     |

### 봇 기본 설정

| 변수           | 설명             | 기본값     |
| -------------- | ---------------- | ---------- |
| `BOT_MARKET`   | 대상 마켓        | `KRW-BTC`  |
| `BOT_STRATEGY` | 사용 전략        | `ensemble` |
| `BOT_UNIT`     | 캔들 단위 (분)   | `60`       |
| `BOT_INTERVAL` | 실행 주기 (ms)   | `60000`    |
| `BOT_CAPITAL`  | 초기 자본금 (원) | `1000000`  |

### 알림 (선택)

| 변수                  | 설명             |
| --------------------- | ---------------- |
| `DISCORD_WEBHOOK_URL` | Discord 웹훅 URL |

### 외부 서비스 (선택)

| 변수             | 설명                                         |
| ---------------- | -------------------------------------------- |
| `ML_SERVICE_URL` | ML 예측 서비스 URL (`http://localhost:5000`) |

---

## 서버 실행

### 개발 모드 (자동 재시작)

```bash
npm run dev
```

nodemon이 `src/` 변경을 감지하면 자동 재시작합니다 (`src/dashboard/` 빌드 산출물은 무시).

### 프로덕션 모드

```bash
npm start
```

### 서버 상태 확인

```bash
curl http://localhost:3008/health
```

---

## 대시보드

React + Vite 기반 SPA로, 서버 실행 후 `http://localhost:3008`에 접속합니다.

### 대시보드 개발

```bash
# 대시보드 의존성 설치 (최초 1회)
cd dashboard && npm ci

# 개발 서버 (HMR, 포트 5173 → 백엔드 3008 프록시)
npm run dashboard:dev

# 프로덕션 빌드 (→ src/dashboard/에 출력)
npm run dashboard:build
```

### 탭 구성

| 탭            | 기능                                      |
| ------------- | ----------------------------------------- |
| **트레이딩**  | 실시간 차트, 봇 설정/시작/정지, 최근 거래 |
| **전략 검증** | 백테스트 + 워크포워드 검증                |
| **리포트**    | 리포트 생성/조회, CSV/PDF 내보내기        |

### 실시간 업데이트

WebSocket으로 실시간 가격, 봇 상태가 자동 갱신됩니다.

---

## 봇 운영

### 봇 설정 변경

대시보드의 **트레이딩** 탭에서 마켓/전략/봉 단위를 선택하고 "적용" 버튼을 누르면 됩니다.

API로도 가능합니다:

```bash
# 봇 설정
curl -X POST http://localhost:3008/api/assets/bot/configure \
  -H "Content-Type: application/json" \
  -d '{"market":"KRW-BTC", "strategyName":"macd", "unit":"60"}'
```

### 봇 시작 / 정지

```bash
# 시작
curl -X POST http://localhost:3008/api/assets/bot/start

# 정지
curl -X POST http://localhost:3008/api/assets/bot/stop

# 상태 확인
curl http://localhost:3008/api/assets/bot
```

### 멀티마켓 운영

여러 마켓을 동시에 운영할 수 있습니다.

```bash
# 봇 추가
curl -X POST http://localhost:3008/api/assets/bots/add \
  -H "Content-Type: application/json" \
  -d '{"market":"KRW-ETH", "strategyName":"macd", "unit":"60"}'

# 전체 시작
curl -X POST http://localhost:3008/api/assets/bots/start-all

# 전체 정지
curl -X POST http://localhost:3008/api/assets/bots/stop-all

# 포트폴리오 현황
curl http://localhost:3008/api/assets/portfolio

# 특정 봇 제거
curl -X DELETE http://localhost:3008/api/assets/bots/KRW-ETH
```

### 거래 모드

| 모드    | 설명                            |
| ------- | ------------------------------- |
| `paper` | 모의 거래 (기본값, 실제 주문 X) |
| `live`  | 실제 거래 (업비트 API 키 필수)  |

`.env`에서 `TRADING_MODE=live`로 변경하면 실매매 모드로 전환됩니다.

> ⚠️ **주의**: `live` 모드 전환 전 반드시 `paper` 모드로 충분히 테스트하세요.

---

## 전략

### 사용 가능한 전략 (10개)

| 이름                  | 설명                         | 상태                            |
| --------------------- | ---------------------------- | ------------------------------- |
| `macd`                | MACD 크로스오버              | ✅ **추천** (OOS 수익률 +0.43%) |
| `ensemble`            | MACD + Mean-Reversion 앙상블 | 사용 가능                       |
| `mean-reversion`      | 켈트너 채널 평균회귀         | 사용 가능                       |
| `ma-cross`            | 이동평균 골든/데드크로스     | 사용 가능                       |
| `rsi`                 | RSI 과매도/과매수            | 사용 가능                       |
| `bollinger`           | 볼린저 밴드                  | 사용 가능                       |
| `combo-signal`        | 복합 시그널                  | 사용 가능                       |
| `volatility-breakout` | 변동성 돌파                  | ⚠️ 비추천                       |
| `triple-ema`          | 삼중 EMA                     | ⚠️ 비추천                       |
| `adaptive-momentum`   | 적응형 모멘텀                | ⚠️ 비추천                       |

> Walk-Forward 분석 결과, **MACD만 OOS(Out-of-Sample)에서 수익**을 기록했습니다.
> 비추천 전략 사용 시 경고 메시지가 출력됩니다.

### 전략 API

```bash
# 전략 목록 조회
curl http://localhost:3008/api/strategies

# 전략 파라미터 변경
curl -X PUT http://localhost:3008/api/strategies/macd/params \
  -H "Content-Type: application/json" \
  -d '{"fastPeriod": 12, "slowPeriod": 21, "signalPeriod": 7}'

# 전략 활성화/비활성화
curl -X POST http://localhost:3008/api/strategies/rsi/toggle
```

### MACD 기본 파라미터 (WF 최적값)

| 파라미터       | 값  | 설명             |
| -------------- | --- | ---------------- |
| `fastPeriod`   | 12  | 빠른 EMA 기간    |
| `slowPeriod`   | 21  | 느린 EMA 기간    |
| `signalPeriod` | 7   | 시그널 라인 기간 |

### 엔진 기본 파라미터 (WF 최적값)

| 파라미터          | 값  | 설명                   |
| ----------------- | --- | ---------------------- |
| `riskPerTrade`    | 0.2 | 거래당 리스크 (20%)    |
| `stopLossATR`     | 1.5 | 손절 (ATR × 1.5)       |
| `takeProfitATR`   | 5.0 | 익절 (ATR × 5.0)       |
| `trailingStopATR` | 0   | 트레일링 스탑 (비활성) |
| `cooldownBars`    | 2   | 손절 후 재진입 대기    |

---

## 백테스트

### API로 실행

```bash
curl -X POST http://localhost:3008/api/assets/backtest/run \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "macd",
    "market": "KRW-BTC",
    "unit": "60",
    "startDate": "2025-01-01",
    "endDate": "2025-04-01",
    "capital": 1000000,
    "riskPerTrade": 0.2,
    "stopLossATR": 1.5,
    "takeProfitATR": 5.0,
    "useMarketDetector": true
  }'
```

### CLI로 실행

```bash
node src/cli/backtest.js \
  --strategy macd \
  --market KRW-BTC \
  --unit 60 \
  --count 200 \
  --capital 1000000
```

### 결과 항목

- 최종 자본금, 총 수익률 (%), 최대 낙폭 (%)
- 샤프 비율, 거래 횟수, 승률
- 총 수수료, 평균 손익

### 백테스트 목록 조회

```bash
# 전체 목록
curl http://localhost:3008/api/assets/backtest

# 특정 결과 상세 조회
curl http://localhost:3008/api/assets/backtest/{파일명}
```

### 주요 옵션

| 옵션                | 타입    | 기본값     | 설명                          |
| ------------------- | ------- | ---------- | ----------------------------- |
| `strategy`          | string  | `ma-cross` | 전략 이름                     |
| `market`            | string  | `KRW-BTC`  | 마켓 코드                     |
| `unit`              | string  | `60`       | 캔들 단위 (1/5/15/60/240/day) |
| `startDate`         | string  | —          | 시작일 (YYYY-MM-DD)           |
| `endDate`           | string  | —          | 종료일 (YYYY-MM-DD)           |
| `capital`           | number  | `1000000`  | 초기 자본금                   |
| `riskPerTrade`      | number  | `0.2`      | 거래당 리스크 비율            |
| `stopLossATR`       | number  | `1.5`      | 손절 ATR 배수                 |
| `takeProfitATR`     | number  | `5.0`      | 익절 ATR 배수                 |
| `trailingStopATR`   | number  | `0`        | 트레일링 스탑 ATR 배수        |
| `allowShort`        | boolean | `false`    | 공매도 허용                   |
| `useMarketDetector` | boolean | `true`     | 시장 상태 감지 사용           |

---

## Walk-Forward 분석

과적합을 방지하는 검증 방법입니다. 데이터를 여러 윈도우로 분할하여 학습(in-sample) 구간에서 최적화한 파라미터를 테스트(out-of-sample) 구간에서 검증합니다.

### API로 실행

```bash
curl -X POST http://localhost:3008/api/assets/backtest/walk-forward \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "macd",
    "market": "KRW-BTC",
    "unit": "60",
    "startDate": "2025-01-01",
    "endDate": "2025-04-01",
    "windows": 4,
    "trainRatio": 0.7,
    "metric": "calmar",
    "optimizeStrategy": true,
    "useMarketDetector": false
  }'
```

### 주요 옵션

| 옵션               | 타입    | 기본값   | 설명                                     |
| ------------------ | ------- | -------- | ---------------------------------------- |
| `windows`          | number  | `4`      | 분석 윈도우 수                           |
| `trainRatio`       | number  | `0.7`    | 학습 비율 (70% 학습, 30% 테스트)         |
| `metric`           | string  | `calmar` | 최적화 지표 (`sharpe`/`return`/`calmar`) |
| `optimizeStrategy` | boolean | `false`  | 전략 파라미터도 최적화                   |

### 최적화 그리드

엔진 파라미터 그리드:

- `stopLossATR`: [1.0, 1.5, 2.0]
- `takeProfitATR`: [5.0, 6.0, 8.0]
- `riskPerTrade`: [0.15, 0.2]

MACD 전략 그리드 (`optimizeStrategy: true` 시):

- `fastPeriod`: [10, 12]
- `slowPeriod`: [18, 21, 24]
- `signalPeriod`: [5, 7, 9]

---

## 리포트

### 리포트 생성

```bash
# 일간/주간/월간 리포트 생성
curl -X POST http://localhost:3008/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{"period": "daily"}'
  # period: "daily" | "weekly" | "monthly"
```

### 리포트 조회

```bash
# 리포트 목록
curl http://localhost:3008/api/reports

# 상세 조회
curl http://localhost:3008/api/reports/{파일명}
```

### 내보내기

```bash
# CSV 다운로드 (Excel 호환, UTF-8 BOM)
curl -O http://localhost:3008/api/reports/{파일명}/csv

# PDF 다운로드
curl -O http://localhost:3008/api/reports/{파일명}/pdf
```

---

## CLI 도구

### 백테스트 CLI

```bash
node src/cli/backtest.js [옵션]
```

| 플래그       | 기본값     | 설명           |
| ------------ | ---------- | -------------- |
| `--strategy` | `ma-cross` | 전략 이름      |
| `--market`   | `KRW-BTC`  | 마켓 코드      |
| `--unit`     | `60`       | 캔들 단위 (분) |
| `--count`    | `200`      | 캔들 개수      |
| `--capital`  | `1000000`  | 초기 자본금    |

### 실시간 거래 CLI

```bash
node src/cli/trade.js [옵션]
```

| 플래그           | 기본값     | 설명             |
| ---------------- | ---------- | ---------------- |
| `--strategy`     | `ma-cross` | 전략 이름        |
| `--market`       | `KRW-BTC`  | 마켓 코드        |
| `--unit`         | `60`       | 캔들 단위        |
| `--count`        | `200`      | 분석 캔들 수     |
| `--interval`     | `60`       | 체크 주기 (초)   |
| `--capital`      | `1000000`  | 초기 자본금      |
| `--stop-loss`    | `3`        | 손절 (%)         |
| `--take-profit`  | `5`        | 익절 (%)         |
| `--max-position` | `0.3`      | 최대 포지션 비율 |

`Ctrl+C`로 종료 시 최종 자본금, 거래 횟수, 미체결 포지션을 표시합니다.

---

## API 레퍼런스

### 엔드포인트 전체 목록

인증 없이 모든 API를 바로 호출할 수 있습니다.

#### 헬스체크

| 메서드 | 경로      | 설명                    |
| ------ | --------- | ----------------------- |
| GET    | `/health` | 서버 상태 (인증 불필요) |

#### 자산 & 봇 (`/api/assets`)

| 메서드 | 경로                          | 설명             |
| ------ | ----------------------------- | ---------------- |
| GET    | `/api/assets/`                | 현재 자산 현황   |
| GET    | `/api/assets/bot`             | 봇 상태          |
| POST   | `/api/assets/bot/start`       | 봇 시작          |
| POST   | `/api/assets/bot/stop`        | 봇 정지          |
| POST   | `/api/assets/bot/configure`   | 봇 설정 변경     |
| GET    | `/api/assets/candles/:market` | 캔들 데이터 조회 |
| GET    | `/api/assets/portfolio`       | 포트폴리오 현황  |

#### 멀티봇 (`/api/assets/bots`)

| 메서드 | 경로                             | 설명           |
| ------ | -------------------------------- | -------------- |
| GET    | `/api/assets/bots`               | 등록된 봇 목록 |
| POST   | `/api/assets/bots/add`           | 봇 추가        |
| DELETE | `/api/assets/bots/:market`       | 봇 제거        |
| GET    | `/api/assets/bots/:market`       | 특정 봇 상태   |
| POST   | `/api/assets/bots/:market/start` | 특정 봇 시작   |
| POST   | `/api/assets/bots/:market/stop`  | 특정 봇 정지   |
| POST   | `/api/assets/bots/start-all`     | 전체 시작      |
| POST   | `/api/assets/bots/stop-all`      | 전체 정지      |

#### 백테스트 (`/api/assets/backtest`)

| 메서드 | 경로                                | 설명               |
| ------ | ----------------------------------- | ------------------ |
| GET    | `/api/assets/backtest`              | 백테스트 결과 목록 |
| POST   | `/api/assets/backtest/run`          | 백테스트 실행      |
| GET    | `/api/assets/backtest/:file`        | 결과 상세 조회     |
| POST   | `/api/assets/backtest/walk-forward` | Walk-Forward 실행  |

#### 거래 내역 (`/api/trades`)

| 메서드 | 경로                 | 설명                     |
| ------ | -------------------- | ------------------------ |
| GET    | `/api/trades/`       | 거래 내역 (페이지네이션) |
| GET    | `/api/trades/stats`  | 거래 통계                |
| GET    | `/api/trades/orders` | 주문 내역                |

쿼리 파라미터: `market`, `type`, `limit`, `offset`, `page`

#### 전략 (`/api/strategies`)

| 메서드 | 경로                         | 설명                 |
| ------ | ---------------------------- | -------------------- |
| GET    | `/api/strategies`            | 전략 목록 + 파라미터 |
| POST   | `/api/strategies/:id/toggle` | 전략 활성화/비활성화 |
| PUT    | `/api/strategies/:id/params` | 전략 파라미터 수정   |

#### 리포트 (`/api/reports`)

| 메서드 | 경로                     | 설명         |
| ------ | ------------------------ | ------------ |
| GET    | `/api/reports`           | 리포트 목록  |
| POST   | `/api/reports/generate`  | 리포트 생성  |
| GET    | `/api/reports/:file`     | 리포트 상세  |
| GET    | `/api/reports/:file/csv` | CSV 다운로드 |
| GET    | `/api/reports/:file/pdf` | PDF 다운로드 |

---

## 고급 기능

### 몬테카를로 시뮬레이션

과거 거래 데이터 기반으로 미래 자본 분포를 추정합니다.

```javascript
const { monteCarlo } = require('./src/engine/advancedAnalysis');

const result = await monteCarlo({
  simulations: 1000,
  tradeCount: 100,
  initialCapital: 1000000,
  market: 'KRW-BTC',
});
// → { mean, median, p5, p25, p75, p95, min, max, ruinProbability, histogram }
```

### ML 예측 서비스

Python ML 마이크로서비스와 연동하여 예측 신호를 받을 수 있습니다.

```bash
# ML 서비스 시작
pip install flask numpy pandas scikit-learn
python scripts/ml_service.py

# .env에 설정
ML_SERVICE_URL=http://localhost:5000
```

---

## 백업

### 자동 백업 설정

```bash
# 크론탭 등록 (매일 03:00 실행)
crontab -e
# 추가:
0 3 * * * /path/to/scripts/backup.sh
```

- **대상**: `data/` 디렉토리 전체 (봇 상태, 백테스트 결과, 캔들 데이터, 리포트)
- **형식**: `backups/backup_YYYYMMDD_HHMMSS.tar.gz`
- **보관**: 최근 7일치만 유지, 이전 백업 자동 삭제

### 수동 백업

```bash
bash scripts/backup.sh
```

---

## 문제 해결

### 서버가 시작되지 않을 때

```bash
# 포트 충돌 확인
lsof -ti:3008

# 기존 프로세스 종료
lsof -ti:3008 | xargs kill -9
```

### 캔들 데이터가 없을 때

업비트 API는 분당 요청 수 제한이 있습니다. 대량 데이터 조회 시 자동으로 지연을 적용하지만, 반복 실패 시 잠시 후 재시도하세요.

### 테스트 실행

```bash
npm test                # 전체 테스트
npm run test:watch      # 감시 모드
```

### 코드 품질

```bash
npm run lint            # 린트 검사
npm run format          # 코드 포맷팅
```
