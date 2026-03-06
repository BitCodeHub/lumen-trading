# ML Model Integration Specification
**Author:** Unc Lumen (CTO)  
**For:** Elim (ML/Research)  
**Date:** 2026-03-04

---

## 🔌 INPUT/OUTPUT FORMATS

### 1. LSTM Price Predictor

**Input (from Brain to ML):**
```json
{
  "model": "lstm_price",
  "asset": "BTC-PERP",
  "timeframe": "1h",
  "data": {
    "ohlcv": [
      {"ts": 1709596800, "o": 67500, "h": 67800, "l": 67200, "c": 67600, "v": 1250000},
      // ... last 168 candles (7 days of hourly)
    ],
    "indicators": {
      "rsi_14": 58.3,
      "macd": 125.5,
      "macd_signal": 110.2,
      "bb_upper": 68500,
      "bb_lower": 66500,
      "atr_14": 850
    }
  },
  "predict_horizons": ["1h", "4h", "24h"]
}
```

**Output (from ML to Brain):**
```json
{
  "model": "lstm_price",
  "asset": "BTC-PERP",
  "timestamp": 1709600400,
  "predictions": {
    "1h": {
      "direction": "up",
      "confidence": 0.72,
      "price_target": 67850,
      "price_range": [67600, 68100]
    },
    "4h": {
      "direction": "up",
      "confidence": 0.65,
      "price_target": 68200,
      "price_range": [67400, 69000]
    },
    "24h": {
      "direction": "neutral",
      "confidence": 0.51,
      "price_target": 67800,
      "price_range": [66000, 70000]
    }
  },
  "model_version": "lstm_v1.2",
  "inference_ms": 45
}
```

---

### 2. Transformer Model

**Input:**
```json
{
  "model": "transformer_price",
  "asset": "ETH-PERP",
  "timeframe": "4h",
  "context_window": 720,  // 120 days of 4h candles
  "data": {
    "ohlcv": [...],  // Last 720 candles
    "funding_rates": [...],
    "open_interest": [...],
    "liquidations": [...]
  },
  "predict_horizons": ["4h", "24h", "7d"]
}
```

**Output:**
```json
{
  "model": "transformer_price",
  "asset": "ETH-PERP",
  "timestamp": 1709600400,
  "predictions": {
    "4h": {
      "direction": "up",
      "confidence": 0.78,
      "attention_focus": ["funding_rate_spike", "oi_decrease"],
      "price_target": 3520,
      "volatility_forecast": "low"
    },
    "24h": {...},
    "7d": {...}
  },
  "model_version": "transformer_v1.0",
  "inference_ms": 120
}
```

---

### 3. Sentiment Analyzer (FinBERT)

**Input:**
```json
{
  "model": "sentiment_finbert",
  "asset": "BTC",
  "texts": [
    {"source": "twitter", "text": "Fed signals rate cuts incoming, bullish for risk assets", "timestamp": 1709599000},
    {"source": "news", "text": "SEC delays Bitcoin ETF decision again", "timestamp": 1709598500},
    {"source": "reddit", "text": "Whale just bought 1000 BTC, moon soon", "timestamp": 1709598000}
  ],
  "aggregate": true
}
```

**Output:**
```json
{
  "model": "sentiment_finbert",
  "asset": "BTC",
  "timestamp": 1709600400,
  "individual_scores": [
    {"text_id": 0, "sentiment": "bullish", "score": 0.85, "impact": "high"},
    {"text_id": 1, "sentiment": "bearish", "score": 0.72, "impact": "medium"},
    {"text_id": 2, "sentiment": "bullish", "score": 0.68, "impact": "low"}
  ],
  "aggregate_sentiment": {
    "direction": "bullish",
    "score": 0.62,  // Weighted average
    "confidence": 0.74,
    "dominant_themes": ["fed_policy", "etf_news", "whale_activity"]
  },
  "model_version": "finbert_v1.0",
  "inference_ms": 35
}
```

---

### 4. Whale Behavior Predictor

**Input:**
```json
{
  "model": "whale_predictor",
  "whale_addresses": [
    "0xabc123...",
    "0xdef456...",
    "0x789ghi..."
  ],
  "lookback_trades": 50,
  "current_positions": [
    {"address": "0xabc123...", "asset": "BTC-PERP", "side": "long", "size": 500000, "entry": 67200, "pnl_pct": 0.5}
  ]
}
```

**Output:**
```json
{
  "model": "whale_predictor",
  "timestamp": 1709600400,
  "predictions": [
    {
      "address": "0xabc123...",
      "alias": "TopTrader1",
      "win_rate_30d": 0.68,
      "current_action": "holding",
      "next_action_prediction": {
        "action": "add_to_position",
        "confidence": 0.65,
        "expected_timing": "4-8h",
        "expected_size_increase": 0.20  // 20% increase
      },
      "follow_recommendation": "wait"  // wait | copy_now | avoid
    }
  ],
  "model_version": "whale_v1.0",
  "inference_ms": 80
}
```

---

### 5. Regime Detector

**Input:**
```json
{
  "model": "regime_detector",
  "asset": "BTC-PERP",
  "data": {
    "volatility_30d": 0.045,
    "trend_strength": 0.72,  // ADX
    "volume_trend": "increasing",
    "correlation_sp500": 0.65,
    "fear_greed_index": 72,
    "funding_rate": 0.0008
  }
}
```

**Output:**
```json
{
  "model": "regime_detector",
  "asset": "BTC-PERP",
  "timestamp": 1709600400,
  "regime": {
    "primary": "trending_up",
    "secondary": "low_volatility",
    "confidence": 0.82,
    "regime_age_hours": 72,  // How long in this regime
    "regime_stability": 0.78  // Likelihood to continue
  },
  "strategy_recommendations": {
    "momentum": 0.85,      // High allocation
    "mean_reversion": 0.15,  // Low allocation
    "grid": 0.30,
    "dca": 0.60
  },
  "model_version": "regime_v1.0",
  "inference_ms": 15
}
```

---

### 6. Ensemble Aggregator (Final Decision)

**Input (aggregated from all models):**
```json
{
  "model": "ensemble",
  "asset": "BTC-PERP",
  "model_outputs": {
    "lstm": {...},
    "transformer": {...},
    "sentiment": {...},
    "whale": {...},
    "regime": {...}
  },
  "current_positions": [...],
  "risk_budget": {
    "available_capital": 980,
    "max_position_size": 19.6,  // 2% of 980
    "daily_loss_remaining": 45  // $50 - $5 already lost today
  }
}
```

**Output:**
```json
{
  "model": "ensemble",
  "asset": "BTC-PERP",
  "timestamp": 1709600400,
  "decision": {
    "action": "long",  // long | short | close | hold | skip
    "confidence": 0.71,
    "position_size_usd": 19.6,
    "entry_price": 67600,
    "stop_loss": 66200,  // -2.1%
    "take_profit": 69800,  // +3.3%
    "risk_reward": 1.57,
    "expected_holding_period": "4-8h"
  },
  "model_weights_used": {
    "lstm": 0.25,
    "transformer": 0.30,
    "sentiment": 0.15,
    "whale": 0.20,
    "regime": 0.10
  },
  "dissenting_models": ["sentiment"],  // Models that disagreed
  "reasoning": "Strong upward momentum on 4H, transformer and whale signals aligned, sentiment slightly bearish but overridden by technical signals. Regime favors momentum strategies.",
  "model_version": "ensemble_v1.0",
  "total_inference_ms": 295
}
```

---

## 🔄 DATA FLOW

```
┌─────────────────────────────────────────────────────────────────┐
│                     REAL-TIME DATA FEEDS                         │
│  Price (Hyperliquid) | News (APIs) | Whales (On-chain) | Social │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FEATURE ENGINEERING                           │
│  OHLCV → Indicators | Text → Embeddings | Addresses → Features  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    LSTM      │     │ TRANSFORMER  │     │   FINBERT    │
│   (45ms)     │     │   (120ms)    │     │   (35ms)     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    WHALE     │     │   REGIME     │     │   (Other)    │
│   (80ms)     │     │   (15ms)     │     │              │
└──────┬───────┘     └──────┬───────┘     └──────────────┘
       │                    │
       └────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ENSEMBLE AGGREGATOR                           │
│  Weighted voting | Confidence calibration | Risk adjustment     │
│                        (~50ms)                                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DECISION OUTPUT                               │
│  Action: long/short/close/hold | Size | Entry | SL | TP         │
│                   Total latency: <300ms                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 API ENDPOINT (ML Service)

**Base URL:** `http://localhost:5000/ml` (local) or `http://100.79.93.27:5000/ml` (DGX)

**Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/predict/lstm` | LSTM price prediction |
| POST | `/predict/transformer` | Transformer prediction |
| POST | `/predict/sentiment` | Sentiment analysis |
| POST | `/predict/whale` | Whale behavior |
| POST | `/predict/regime` | Market regime |
| POST | `/predict/ensemble` | Full ensemble decision |
| GET | `/health` | Service health check |
| GET | `/models` | List available models |

**Headers:**
```
Content-Type: application/json
X-API-Key: YOUR_ML_SERVICE_KEY
```

---

## 📊 PERFORMANCE REQUIREMENTS

| Model | Max Latency | Min Accuracy | Update Frequency |
|-------|-------------|--------------|------------------|
| LSTM | 100ms | 55% directional | Retrain weekly |
| Transformer | 200ms | 58% directional | Retrain weekly |
| Sentiment | 50ms | 70% classification | Real-time |
| Whale | 150ms | 60% next-move | Retrain daily |
| Regime | 30ms | 80% regime ID | Retrain weekly |
| Ensemble | 50ms (aggregation) | 60% profitable trades | Adjust weights daily |

**Total decision latency: <500ms from signal to order**

---

## 🔐 ERROR HANDLING

If any ML model fails:
1. Log error with full context
2. Fall back to simpler heuristic (e.g., MA crossover)
3. Reduce position size by 50%
4. Alert via WhatsApp
5. If >3 failures in 1 hour, disable ML and use conservative mode

```javascript
const ML_FALLBACK = {
  lstm_fail: 'use_ma_crossover',
  sentiment_fail: 'assume_neutral',
  whale_fail: 'ignore_whale_signals',
  regime_fail: 'assume_ranging',
  ensemble_fail: 'no_trade'
};
```

---

**Elim — This is your integration spec. Build your models to match these I/O formats and we'll plug right in.**

**Questions? Ping me.** 💎
