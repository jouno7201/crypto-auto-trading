#!/usr/bin/env python3
"""
ML 마이크로서비스 (Flask)
- 가격 예측 (LSTM / XGBoost)
- 센티먼트 분석
- 모델 학습

실행: pip install flask numpy && python scripts/ml_service.py
"""

from flask import Flask, request, jsonify
import numpy as np
import os

app = Flask(__name__)

# 간단한 모멘텀 기반 예측 (실제 배포 시 LSTM/XGBoost로 교체)
@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    candles = data.get('candles', [])

    if len(candles) < 20:
        return jsonify({'prediction': 'hold', 'confidence': 0, 'reason': 'insufficient data'})

    # 최근 가격 추출
    closes = [c.get('close') or c.get('trade_price', 0) for c in candles[-50:]]
    closes = [c for c in closes if c > 0]

    if len(closes) < 10:
        return jsonify({'prediction': 'hold', 'confidence': 0, 'reason': 'no valid prices'})

    prices = np.array(closes, dtype=float)

    # 이동평균 크로스오버 + 모멘텀
    sma_short = np.mean(prices[-5:])
    sma_long = np.mean(prices[-20:])
    momentum = (prices[-1] - prices[-10]) / prices[-10]
    volatility = np.std(prices[-20:]) / np.mean(prices[-20:])

    # 예측 로직
    score = 0
    if sma_short > sma_long:
        score += 0.3
    else:
        score -= 0.3

    score += np.clip(momentum * 5, -0.4, 0.4)

    if volatility > 0.05:
        score *= 0.7  # 고변동성 시 확신 감소

    if score > 0.15:
        prediction = 'buy'
    elif score < -0.15:
        prediction = 'sell'
    else:
        prediction = 'hold'

    confidence = min(abs(score), 1.0)

    return jsonify({
        'prediction': prediction,
        'confidence': round(confidence, 3),
        'priceTarget': round(float(prices[-1] * (1 + score * 0.1)), 2),
        'features': {
            'sma_cross': round(float(sma_short / sma_long - 1), 4),
            'momentum': round(float(momentum), 4),
            'volatility': round(float(volatility), 4),
        }
    })


@app.route('/sentiment', methods=['POST'])
def sentiment():
    """센티먼트 분석 (뉴스/소셜 통합)"""
    data = request.json
    market = data.get('market', '')

    # 실제 배포 시 뉴스 API (CryptoPanic, LunarCrush 등) 연동
    # 현재는 중립 반환
    return jsonify({
        'market': market,
        'sentiment': 0.0,
        'sources': [],
        'summary': 'Sentiment analysis service placeholder - configure news API for live data',
    })


@app.route('/train', methods=['POST'])
def train():
    """모델 학습"""
    data = request.json
    market = data.get('market', '')
    training_data = data.get('data', [])

    return jsonify({
        'status': 'ok',
        'market': market,
        'samples': len(training_data),
        'message': 'Training placeholder - implement with sklearn/pytorch',
    })


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    port = int(os.environ.get('ML_PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
