/**
 * LUMEN ALPHA Trading Bot
 * Wall Street-grade AI-powered trading system
 * 
 * Author: Unc Lumen (CTO) 💎
 * Date: 2026-03-04
 */

import express from 'express';
import { WebhookServer } from './webhook/server.js';
import { RiskManager } from './risk/manager.js';
import { BrainAnalyzer } from './brain/analyzer.js';
import { PaperTrading } from './execution/paper-trading.js';
import { WhatsAppNotifier } from './notifications/whatsapp.js';
import { AutoTrader } from './scanner/auto-trader.js';
import { PositionMonitor } from './scanner/position-monitor.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';

const app = express();
app.use(express.json());

// CORS for dashboard access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Initialize components
const riskManager = new RiskManager(config.risk);
const brain = new BrainAnalyzer(config.ml);
const executor = new PaperTrading(); // Start with paper trading
const notifier = new WhatsAppNotifier();
const autoTrader = new AutoTrader(brain, riskManager, executor, notifier);
const positionMonitor = new PositionMonitor(executor, notifier, riskManager);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    mode: config.tradingMode,
    timestamp: new Date().toISOString()
  });
});

// TradingView webhook endpoint
app.post('/webhook/tradingview', async (req, res) => {
  try {
    const { key } = req.query;
    
    // Validate webhook secret
    if (key !== config.webhookSecret) {
      logger.warn('Invalid webhook secret');
      return res.status(401).json({ error: 'Invalid secret' });
    }
    
    const signal = req.body;
    logger.info('Received TradingView signal', signal);
    
    // Validate signal format
    if (!signal.asset || !signal.action) {
      return res.status(400).json({ error: 'Invalid signal format' });
    }
    
    // Check signal age (max 5 minutes)
    const signalAge = Date.now() - new Date(signal.timestamp).getTime();
    if (signalAge > 5 * 60 * 1000) {
      logger.warn('Signal too old', { age: signalAge });
      return res.status(400).json({ error: 'Signal too old' });
    }
    
    // Process through brain
    const analysis = await brain.analyze(signal);
    
    // Check risk limits
    const riskCheck = riskManager.checkTrade(analysis);
    if (!riskCheck.approved) {
      logger.warn('Trade rejected by risk manager', riskCheck);
      await notifier.send(`⚠️ Trade rejected: ${riskCheck.reason}`);
      return res.json({ status: 'rejected', reason: riskCheck.reason });
    }
    
    // Execute trade (paper or live)
    const trade = await executor.execute(analysis);
    
    // Notify
    await notifier.send(`✅ Trade executed: ${trade.action} ${trade.asset} @ ${trade.price}`);
    
    logger.info('Trade executed', trade);
    res.json({ status: 'executed', trade });
    
  } catch (error) {
    logger.error('Webhook error', error);
    res.status(500).json({ error: error.message });
  }
});

// ML prediction endpoint (proxies to Elim's DGX API)
app.post('/ml/predict/:model', async (req, res) => {
  try {
    const prediction = await brain.predict(req.params.model, req.body);
    res.json(prediction);
  } catch (error) {
    logger.error('ML prediction error', error);
    res.status(500).json({ error: error.message });
  }
});

// Portfolio status (both /portfolio and /api/portfolio for dashboard compatibility)
app.get('/portfolio', (req, res) => {
  res.json({
    positions: executor.getPositions(),
    pnl: executor.getPnL(),
    equity: executor.getEquity(),
    riskMetrics: riskManager.getMetrics()
  });
});

app.get('/api/portfolio', (req, res) => {
  res.json({
    positions: executor.getPositions(),
    pnl: executor.getPnL(),
    equity: executor.getEquity(),
    riskMetrics: riskManager.getMetrics()
  });
});

// Additional API routes for dashboard
app.get('/api/positions', (req, res) => {
  res.json(executor.getPositions());
});

app.get('/api/trades', (req, res) => {
  res.json(executor.getHistory());
});

// ML Signals for all assets
app.get('/api/signals', async (req, res) => {
  try {
    const assets = [
      'BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'MATIC',
      'ATOM', 'UNI', 'LTC', 'NEAR', 'APT', 'ARB', 'OP', 'INJ', 'SUI', 'FTM',
      'COIN', 'MARA', 'RIOT', 'MSTR', 'AAPL', 'TSLA', 'NVDA', 'GOOGL', 'AMZN', 'META'
    ];
    
    const signals = await Promise.all(assets.map(async (symbol) => {
      try {
        const analysis = await brain.analyze({ asset: symbol, price: 0 });
        return {
          symbol,
          prediction: analysis.action === 'buy' ? 'long' : analysis.action === 'sell' ? 'short' : 'neutral',
          confidence: (analysis.confidence || 0.5) * 100,
          accuracy: (analysis.modelAccuracy || 0.55) * 100,
          lastUpdated: new Date().toISOString()
        };
      } catch (e) {
        return {
          symbol,
          prediction: 'neutral',
          confidence: 50,
          accuracy: 55,
          lastUpdated: new Date().toISOString()
        };
      }
    }));
    
    // Sort by confidence
    signals.sort((a, b) => b.confidence - a.confidence);
    res.json({ signals, count: signals.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update position SL/TP
app.post('/api/positions/update-sltp', (req, res) => {
  const { stopLoss, takeProfit } = req.body;
  
  if (!stopLoss && !takeProfit) {
    return res.status(400).json({ error: 'Provide stopLoss and/or takeProfit' });
  }
  
  const positions = executor.getPositions();
  let updated = 0;
  
  positions.forEach(pos => {
    if (stopLoss) pos.stopLoss = stopLoss;
    if (takeProfit) pos.takeProfit = takeProfit;
    updated++;
  });
  
  logger.info(`Updated SL/TP for ${updated} positions`, { stopLoss, takeProfit });
  res.json({ message: `Updated ${updated} positions`, stopLoss, takeProfit });
});

// Kill switch
app.post('/kill-switch', (req, res) => {
  const { key } = req.query;
  if (key !== config.webhookSecret) {
    return res.status(401).json({ error: 'Invalid secret' });
  }
  
  executor.killSwitch();
  riskManager.halt();
  autoTrader.stop();
  notifier.send('🛑 KILL SWITCH ACTIVATED - All trading halted');
  
  logger.warn('KILL SWITCH ACTIVATED');
  res.json({ status: 'halted', timestamp: new Date().toISOString() });
});

// AutoTrader status
app.get('/autotrader/status', (req, res) => {
  res.json(autoTrader.getStatus());
});

// Start/Stop AutoTrader
app.post('/autotrader/start', (req, res) => {
  autoTrader.start();
  res.json({ status: 'started' });
});

app.post('/autotrader/stop', (req, res) => {
  autoTrader.stop();
  res.json({ status: 'stopped' });
});

// Position monitor status
app.get('/positions/monitor', (req, res) => {
  res.json(positionMonitor.getStatus());
});

// Start server
const PORT = config.port || 8080;
app.listen(PORT, () => {
  logger.info(`LUMEN ALPHA Trading Bot started on port ${PORT}`);
  logger.info(`Mode: ${config.tradingMode}`);
  logger.info(`Risk limits: ${JSON.stringify(config.risk)}`);
  notifier.send(`🚀 LUMEN ALPHA Trading Bot started (${config.tradingMode} mode)`);
  
  // Start autonomous trading (opens positions)
  if (config.autoTrading !== false) {
    autoTrader.start();
  }
  
  // Start position monitor (closes positions on SL/TP)
  positionMonitor.start();
  logger.info('PositionMonitor started - monitoring SL/TP every 30s');
});

export default app;
