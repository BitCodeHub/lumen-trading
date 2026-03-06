/**
 * Autonomous Trading Scanner
 * Continuously scans assets and executes trades based on ML predictions
 */

import { logger } from '../utils/logger.js';
import { TOP_CRYPTO, CRYPTO_STOCKS, TECH_STOCKS } from '../data/assets.js';

// Stock symbols (trade only during market hours)
const STOCKS = new Set([...CRYPTO_STOCKS, ...TECH_STOCKS]);

// Check if US stock market is open (9:30 AM - 4:00 PM ET, Mon-Fri)
function isUSMarketOpen() {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay();
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  // Weekdays only (Mon=1, Fri=5)
  if (day === 0 || day === 6) return false;
  
  // Market hours: 9:30 AM (570 min) to 4:00 PM (960 min) ET
  return timeInMinutes >= 570 && timeInMinutes < 960;
}

export class AutoTrader {
  constructor(brain, riskManager, executor, notifier) {
    this.brain = brain;
    this.riskManager = riskManager;
    this.executor = executor;
    this.notifier = notifier;
    this.isRunning = false;
    this.scanInterval = null;
    
    // Top 50 crypto + stocks (66 assets total)
    this.assets = [...TOP_CRYPTO, ...CRYPTO_STOCKS, ...TECH_STOCKS];
    
    // Scan every 5 minutes
    this.scanIntervalMs = 5 * 60 * 1000;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('AutoTrader already running');
      return;
    }

    this.isRunning = true;
    logger.info('AutoTrader started', { 
      assets: this.assets.length,
      interval: `${this.scanIntervalMs / 1000}s`
    });

    await this.notifier.send('🤖 AutoTrader started - scanning markets autonomously');

    // Initial scan
    await this.scan();

    // Schedule regular scans
    this.scanInterval = setInterval(() => this.scan(), this.scanIntervalMs);
  }

  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.isRunning = false;
    logger.info('AutoTrader stopped');
  }

  async scan() {
    logger.info('Starting market scan', { assets: this.assets.length });

    for (const asset of this.assets) {
      try {
        await this.analyzeAndTrade(asset);
        // Rate limit: wait 2 seconds between assets
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error(`Error scanning ${asset}`, { error: error.message });
      }
    }

    logger.info('Market scan complete');
  }

  async analyzeAndTrade(asset) {
    // Skip stocks if market is closed
    if (STOCKS.has(asset) && !isUSMarketOpen()) {
      logger.debug(`${asset}: Skipped — US market closed`);
      return;
    }

    // Get ML prediction
    const signal = {
      asset,
      action: 'analyze',
      timestamp: new Date().toISOString()
    };

    const analysis = await this.brain.analyze(signal);
    
    // Only trade if confidence > 55% and action is long/short
    if (!analysis || analysis.confidence < 0.70) {
      logger.debug(`${asset}: Skipped - low confidence ${analysis?.confidence || 0}`);
      return;
    }

    // Check action (not prediction)
    if (analysis.action !== 'long' && analysis.action !== 'short') {
      logger.debug(`${asset}: Skipped - action is ${analysis.action}`);
      return;
    }

    // Check if we already have a position in this asset
    const positions = this.executor.getPositions();
    if (positions.some(p => p.asset === asset)) {
      logger.debug(`${asset}: Skipped - already have position`);
      return; // Already have position
    }

    // Sync position count with risk manager BEFORE checking
    const currentPositions = this.executor.getPositions();
    this.riskManager.updatePositions(currentPositions.length);
    
    // Check risk limits
    const riskCheck = this.riskManager.checkTrade(analysis);
    if (!riskCheck.approved) {
      logger.warn(`${asset}: Trade rejected - ${riskCheck.reason}`);
      return;
    }
    
    logger.info(`${asset}: EXECUTING TRADE - ${analysis.action} @ ${analysis.confidence.toFixed(2)} confidence`);

    // Execute trade
    logger.info(`AutoTrader signal: ${analysis.action.toUpperCase()} ${asset}`, {
      confidence: analysis.confidence,
      accuracy: analysis.modelAccuracy
    });

    try {
      const trade = await this.executor.execute({
        ...analysis,
        source: 'autotrader'
      });

      // Build strategy breakdown message
      let strategyBreakdown = '';
      if (analysis.reasoning) {
        // Parse reasoning string into readable format
        const reasons = analysis.reasoning.split(' | ').slice(0, 5); // Top 5 signals
        strategyBreakdown = '\n\n📋 *Strategy Breakdown:*\n' + 
          reasons.map(r => `• ${r}`).join('\n');
      }
      
      // Include signal details if available
      let signalDetails = '';
      if (analysis.signals) {
        const { ml, whale, sentiment } = analysis.signals;
        signalDetails = '\n\n🧠 *Signals:*\n';
        if (ml) signalDetails += `• ML: ${ml.signal} (${(ml.confidence * 100).toFixed(0)}%)\n`;
        if (whale) signalDetails += `• Whale: ${whale.signal}\n`;
        if (sentiment) signalDetails += `• Sentiment: ${sentiment.signal}\n`;
      }

      // SYNC RISK MANAGER after trade execution
      this.riskManager.updatePositions(this.executor.getPositions().length);

      await this.notifier.send(
        `🤖 AutoTrade: ${trade.action.toUpperCase()} ${trade.asset}\n` +
        `💰 Price: $${trade.price}\n` +
        `📊 Confidence: ${(analysis.confidence * 100).toFixed(1)}%\n` +
        `🎯 Model Accuracy: ${(analysis.modelAccuracy * 100).toFixed(1)}%` +
        signalDetails +
        strategyBreakdown
      );

      logger.info('AutoTrade executed', trade);
    } catch (error) {
      logger.error(`AutoTrade failed for ${asset}`, { error: error.message });
    }
  }

  getStatus() {
    return {
      running: this.isRunning,
      assets: this.assets.length,
      interval: this.scanIntervalMs / 1000
    };
  }
}
