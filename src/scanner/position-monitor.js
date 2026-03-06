/**
 * Position Monitor - Autonomous Position Management
 * 
 * Monitors all open positions and closes them when:
 * - Stop-loss is hit
 * - Take-profit is hit
 * - Time-based exit (optional)
 * 
 * Author: Unc Lumen (CTO) 💎
 */

import { logger } from '../utils/logger.js';
import { priceFeeds } from '../data/price-feeds.js';

export class PositionMonitor {
  constructor(executor, notifier, riskManager) {
    this.executor = executor;
    this.notifier = notifier;
    this.riskManager = riskManager;
    this.isRunning = false;
    this.monitorInterval = null;
    
    // Check positions every 30 seconds
    this.checkIntervalMs = 30 * 1000;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('PositionMonitor already running');
      return;
    }

    this.isRunning = true;
    logger.info('PositionMonitor started', { 
      interval: `${this.checkIntervalMs / 1000}s`
    });

    // Initial check
    await this.checkPositions();

    // Schedule regular checks
    this.monitorInterval = setInterval(() => this.checkPositions(), this.checkIntervalMs);
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isRunning = false;
    logger.info('PositionMonitor stopped');
  }

  async checkPositions() {
    const positions = this.executor.getPositions();
    
    if (positions.length === 0) {
      return; // No positions to monitor
    }

    logger.info('🔍 PositionMonitor checking positions', { count: positions.length });

    for (const position of positions) {
      try {
        await this.evaluatePosition(position);
      } catch (error) {
        logger.error(`Error evaluating position ${position.id}`, { error: error.message });
      }
    }
  }

  async evaluatePosition(position) {
    // Get current real price
    let currentPrice;
    try {
      currentPrice = await priceFeeds.getPrice(position.asset);
    } catch (error) {
      logger.error(`Price fetch error for ${position.asset}: ${error.message}`);
      return;
    }
    
    if (!currentPrice) {
      logger.warn(`⚠️ No price data for ${position.asset} - skipping`);
      return;
    }

    // Calculate price change percentage
    const priceChange = (currentPrice - position.price) / position.price;
    
    // For long positions: positive change = profit
    // For short positions: negative change = profit
    const multiplier = position.action === 'long' ? 1 : -1;
    const pnlPercent = priceChange * multiplier;

    // Check stop-loss (default 2%)
    const stopLoss = position.stopLoss || 0.02;
    if (pnlPercent <= -stopLoss) {
      await this.closePosition(position, currentPrice, 'stop_loss', pnlPercent);
      return;
    }

    // Check take-profit (default 4.8%)
    const takeProfit = position.takeProfit || 0.048;
    if (pnlPercent >= takeProfit) {
      await this.closePosition(position, currentPrice, 'take_profit', pnlPercent);
      return;
    }

    // Log position status (INFO level so it shows up)
    logger.info(`📊 ${position.asset}: Entry $${position.price.toFixed(2)} → Current $${currentPrice.toFixed(2)} | P&L: ${(pnlPercent * 100).toFixed(2)}% | SL: ${(stopLoss * 100).toFixed(1)}% | TP: ${(takeProfit * 100).toFixed(1)}%`);
  }

  async closePosition(position, exitPrice, reason, pnlPercent) {
    const pnl = position.size * pnlPercent;
    
    // Close the position
    const result = this.executor.closePosition(position.id, {
      exitPrice,
      reason,
      pnl,
      pnlPercent
    });

    if (!result) {
      logger.error(`Failed to close position ${position.id}`);
      return;
    }

    // SYNC RISK MANAGER - Fix for dashboard counter mismatch
    const currentPositions = this.executor.getPositions().length;
    this.riskManager.updatePositions(currentPositions);
    logger.info(`📊 Risk manager synced: ${currentPositions} open positions`);

    // Determine emoji based on outcome
    const isProfit = pnl > 0;
    const emoji = isProfit ? '✅💰' : '🛑📉';
    const outcomeText = reason === 'take_profit' ? 'TAKE PROFIT HIT!' : 'STOP LOSS HIT';

    // Send WhatsApp notification
    const message = 
      `${emoji} **POSITION CLOSED: ${position.asset}**\n\n` +
      `📊 ${outcomeText}\n` +
      `💵 Entry: $${position.price.toFixed(2)}\n` +
      `💵 Exit: $${exitPrice.toFixed(2)}\n` +
      `📈 Change: ${(pnlPercent * 100).toFixed(2)}%\n` +
      `💰 P&L: ${isProfit ? '+' : ''}$${pnl.toFixed(2)}\n` +
      `⏱️ Duration: ${this.getDuration(position.timestamp)}\n\n` +
      `📊 Portfolio: $${this.executor.getEquity().toFixed(2)}`;

    await this.notifier.send(message);

    logger.info('Position closed autonomously', {
      asset: position.asset,
      reason,
      pnl: pnl.toFixed(2),
      pnlPercent: (pnlPercent * 100).toFixed(2) + '%',
      equity: this.executor.getEquity().toFixed(2)
    });
  }

  getDuration(timestamp) {
    const ms = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }

  getStatus() {
    return {
      running: this.isRunning,
      interval: this.checkIntervalMs / 1000,
      positions: this.executor.getPositions().length
    };
  }
}
