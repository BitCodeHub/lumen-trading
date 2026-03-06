# Wall Street AI Trading Bot — Architecture Design
**Version:** 1.0  
**Author:** Unc Lumen (CTO)  
**Date:** 2026-03-04  
**Status:** DESIGN PHASE

---

## 🎯 VISION

Build an AI-powered trading system that rivals institutional traders:
- Information edge (whale flows, sentiment, on-chain)
- Speed (sub-second execution)
- Discipline (hardcoded risk rules)
- Adaptation (self-improving strategies)
- Multi-strategy (never dependent on one approach)

---

## 🏗️ SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA SOURCES                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  TradingView    Whale Wallets    X/Twitter    News APIs    On-Chain    │
│  (Webhooks)     (Hyperliquid)    (Sentiment)  (Headlines)  (Flows)     │
└────────┬────────────┬──────────────┬────────────┬───────────┬───────────┘
         │            │              │            │           │
         ▼            ▼              ▼            ▼           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        OPENCLAW BRAIN (Mac Studio)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │   WEBHOOK    │  │  SENTIMENT   │  │    WHALE     │                   │
│  │   RECEIVER   │  │   ANALYZER   │  │   TRACKER    │                   │
│  │  (Port 8080) │  │              │  │              │                   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                   │
│         │                 │                 │                            │
│         ▼                 ▼                 ▼                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    CLAUDE AI ENGINE (Opus 4.5)                   │    │
│  │  - Signal analysis                                               │    │
│  │  - Strategy selection                                            │    │
│  │  - Trade decision (go/no-go)                                     │    │
│  │  - Position sizing                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    RISK MANAGER (Hardcoded)                      │    │
│  │  - Max 2% per trade                                              │    │
│  │  - Circuit breaker at 5% daily drawdown                          │    │
│  │  - Max 5 concurrent positions                                    │    │
│  │  - Human approval > $500                                         │    │
│  │  - Auto-bench after 3 consecutive losses                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    EXECUTION ENGINE                              │    │
│  │  - Order creation                                                │    │
│  │  - Position management                                           │    │
│  │  - Stop-loss automation                                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   HYPERLIQUID   │       │     BYBIT       │       │   ROBINHOOD     │
│   (Crypto DEX)  │       │  (Crypto CEX)   │       │    (Stocks)     │
│                 │       │                 │       │                 │
│  - Perpetuals   │       │  - Spot         │       │  - Equities     │
│  - Sub-second   │       │  - Futures      │       │  - Options      │
└─────────────────┘       └─────────────────┘       └─────────────────┘
                                     │
                                     ▼
                          ┌─────────────────┐
                          │   WHATSAPP      │
                          │   NOTIFICATIONS │
                          │                 │
                          │  - Trade alerts │
                          │  - Approval req │
                          │  - PnL reports  │
                          └─────────────────┘
```

---

## 📁 FILE STRUCTURE

```
trading-bot/
├── ARCHITECTURE.md          # This file
├── README.md                 # Quick start guide
├── package.json              # Dependencies
│
├── src/
│   ├── index.js              # Main entry point
│   │
│   ├── webhook/
│   │   ├── server.js         # Webhook HTTP server (port 8080)
│   │   ├── tradingview.js    # TradingView signal parser
│   │   └── validator.js      # Signal validation
│   │
│   ├── brain/
│   │   ├── analyzer.js       # Claude AI analysis engine
│   │   ├── strategies.js     # Strategy definitions
│   │   └── decision.js       # Go/no-go decision logic
│   │
│   ├── risk/
│   │   ├── manager.js        # Risk management (HARDCODED LIMITS)
│   │   ├── circuit-breaker.js # Emergency stop logic
│   │   └── position-sizing.js # Kelly criterion / fixed %
│   │
│   ├── execution/
│   │   ├── hyperliquid.js    # Hyperliquid API client
│   │   ├── bybit.js          # Bybit API client
│   │   ├── robinhood.js      # Robinhood API client
│   │   └── paper-trading.js  # Simulated execution
│   │
│   ├── data/
│   │   ├── whale-tracker.js  # Whale wallet monitoring
│   │   ├── sentiment.js      # Twitter/news sentiment
│   │   └── on-chain.js       # On-chain metrics
│   │
│   ├── notifications/
│   │   ├── whatsapp.js       # WhatsApp alerts
│   │   └── approval.js       # Human-in-the-loop
│   │
│   └── utils/
│       ├── logger.js         # Audit logging
│       ├── config.js         # Configuration
│       └── vault.js          # Secrets management
│
├── ml/                       # Elim's ML models (DGX Spark)
│   ├── lstm/                 # Price prediction
│   ├── sentiment/            # Sentiment analysis
│   └── backtest/             # Backtesting framework
│
├── config/
│   ├── strategies.json       # Strategy configurations
│   ├── risk.json             # Risk parameters
│   └── exchanges.json        # Exchange settings
│
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── paper/                # Paper trading logs
│
└── logs/
    ├── trades.log            # Trade history
    ├── audit.log             # All AI decisions
    └── errors.log            # Error tracking
```

---

## 🔐 RISK MANAGEMENT (HARDCODED — NON-NEGOTIABLE)

```javascript
const RISK_LIMITS = {
  // Per-trade limits
  maxPositionSize: 0.02,        // 2% of equity per trade
  maxLeverage: 3,               // 3x max leverage
  
  // Portfolio limits
  maxOpenPositions: 5,          // Max concurrent positions
  maxTotalExposure: 0.60,       // 60% max deployed
  
  // Loss limits
  dailyLossLimit: 0.03,         // Stop at 3% daily loss
  weeklyLossLimit: 0.08,        // Stop at 8% weekly loss
  circuitBreaker: 0.05,         // Halt ALL trading at 5% drawdown
  
  // Human approval
  requireApproval: 500,         // Human approval for trades > $500
  
  // Strategy management
  autoBenchAfterLosses: 3,      // Bench strategy after 3 consecutive losses
  benchDuration: '7d',          // Stay benched for 7 days
  
  // Emergency
  killSwitch: true,             // Manual kill switch always available
  cooldownAfterBreaker: '4h'    // 4 hour cooldown after circuit breaker
};
```

**THESE LIMITS ARE HARDCODED AND CANNOT BE OVERRIDDEN BY AI.**

---

## 📊 STRATEGIES (Phase 3)

### 1. Whale Copy Trading (Primary)
- Track profitable wallets on Hyperliquid
- Copy trades with 60-second delay
- Size: 10-20% of whale position
- Win rate: 60-80%

### 2. Momentum Trading
- Multi-timeframe MA alignment (1H, 4H, 1D)
- Volume confirmation
- Trend following only

### 3. Sentiment Trading
- X/Twitter sentiment analysis
- News headline scoring
- Execute on strong signals only

### 4. DCA Smart Entry
- Dollar-cost averaging with timing optimization
- Buy dips, not peaks
- Long-term accumulation

### 5. Grid Trading
- Range-bound markets
- Buy low, sell high automatically
- Works in sideways markets

### 6. Mean Reversion
- Oversold/overbought detection
- RSI + Bollinger Bands
- Counter-trend (risky)

### 7. Funding Rate Arbitrage
- Exploit funding rate differentials
- Low risk, consistent returns

### 8. News Arbitrage
- React to breaking news faster than humans
- Pre-positioned for known events

---

## 🔄 SELF-IMPROVEMENT LOOP

```
┌─────────────────────────────────────────────────────────────┐
│                    TRADE EXECUTION                           │
│  Claude predicts: "70% probability of +2% gain"             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    OUTCOME RECORDING                         │
│  Actual result: +1.5% gain (close to prediction)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    STRATEGY SCORING                          │
│  Momentum strategy: 64% accuracy, Sharpe 1.8               │
│  Sentiment strategy: 52% accuracy, Sharpe 0.9 (BENCHED)    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    WEIGHT ADJUSTMENT                         │
│  Increase momentum allocation: 30% → 35%                    │
│  Decrease sentiment allocation: 15% → 0% (benched)          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📡 WEBHOOK SPECIFICATION

### TradingView Alert Format
```json
{
  "action": "trade",
  "strategy": "momentum",
  "signal": "long",
  "asset": "{{ticker}}",
  "price": "{{close}}",
  "strength": "high",
  "timestamp": "{{time}}"
}
```

### Webhook Endpoint
```
POST https://your-server.com/webhook/trading?key=YOUR_SECRET
Content-Type: application/json
```

### Validation
- Check webhook secret matches
- Validate signal age < 5 minutes
- Rate limit: 10 signals per minute

---

## 👥 TEAM RESPONSIBILITIES

### Unc Lumen (CTO) — Architecture & Core
- [ ] Webhook server (src/webhook/)
- [ ] Brain/analyzer (src/brain/)
- [ ] Risk manager (src/risk/)
- [ ] Execution engine (src/execution/)
- [ ] WhatsApp notifications (src/notifications/)
- [ ] Integration testing

### Luna (CoS) — QA & Operations
- [ ] Test plan creation
- [ ] Risk limit validation
- [ ] Circuit breaker testing
- [ ] Kill switch testing
- [ ] Documentation review
- [ ] Compliance checklist

### Elim (Research) — ML & Data
- [ ] LSTM price prediction (ml/lstm/)
- [ ] Sentiment analysis pipeline (ml/sentiment/)
- [ ] Backtesting framework (ml/backtest/)
- [ ] Historical data collection
- [ ] Model training on DGX Spark
- [ ] Performance metrics

---

## 📅 TIMELINE

### Week 1: Foundation
- Day 1-2: Webhook receiver + basic execution
- Day 3-4: Risk management + paper trading
- Day 5-7: Integration testing + WhatsApp alerts

### Week 2: Information Edge
- Day 1-3: Whale copy trading integration
- Day 4-5: Basic sentiment monitoring
- Day 6-7: Testing and validation

### Week 3: Intelligence
- Day 1-4: ML models (Elim on DGX)
- Day 5-7: Multi-strategy ensemble

### Week 4: Battle Testing
- Day 1-3: Backtesting against 2 years of data
- Day 4-5: Paper trading validation
- Day 6-7: Live trading with $100

---

## ✅ SUCCESS CRITERIA

**Phase 1 Complete When:**
- [ ] Webhook receives TradingView signals
- [ ] Paper trades execute correctly
- [ ] Risk limits are enforced
- [ ] WhatsApp notifications work
- [ ] 7 days of successful paper trading

**Phase 2 Complete When:**
- [ ] Whale tracking operational
- [ ] Sentiment analysis working
- [ ] Both integrated with decision engine

**Phase 3 Complete When:**
- [ ] ML models trained and validated
- [ ] Multi-strategy ensemble running
- [ ] Self-improvement loop functional

**Phase 4 Complete When:**
- [ ] Backtested against 2 years of data
- [ ] Sharpe ratio > 1.5
- [ ] Max drawdown < 15%
- [ ] Live trading profitable for 30 days

---

## 🚨 EMERGENCY PROCEDURES

### Kill Switch
```bash
# Immediate halt all trading
curl -X POST http://localhost:8080/kill-switch?key=YOUR_SECRET

# Or via WhatsApp
# Send: "KILL SWITCH" to trading bot
```

### Circuit Breaker Auto-Triggers
- 5% daily drawdown → All trading halted
- 3 consecutive losses on strategy → Strategy benched
- API error rate > 10% → Pause and alert

### Recovery Procedure
1. Identify cause of issue
2. Fix or acknowledge
3. Wait 4-hour cooldown
4. Resume with reduced position sizes
5. Full size after 24 hours of success

---

**Architecture designed by Unc Lumen 💎**  
**Reviewed by Luna 🌙**  
**ML infrastructure by Elim 🔮**  

*Let's build something that rivals Wall Street.*
