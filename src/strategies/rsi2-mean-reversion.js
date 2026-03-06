/**
 * RSI(2) Mean Reversion Strategy
 * Win Rate: 78%+ on SPY/S&P 500
 * 
 * Entry: RSI(2) < 10 (extremely oversold)
 * Exit: RSI > 70 or after 5 days max hold
 * 
 * Source: Larry Connors, Quantified Strategies
 */

import { logger } from '../utils/logger.js';

export class RSI2Strategy {
  constructor() {
    this.name = 'RSI2 Mean Reversion';
    this.winRate = 0.78;
    this.period = 2; // 2-day RSI
    this.oversoldThreshold = 10;
    this.overboughtThreshold = 70;
    this.maxHoldDays = 5;
  }

  /**
   * Calculate RSI
   */
  calculateRSI(prices, period = 2) {
    if (prices.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Analyze asset for RSI(2) signals
   */
  async analyze(asset, priceData) {
    if (!priceData || priceData.length < 5) {
      return { action: 'skip', confidence: 0, reason: 'Insufficient data' };
    }
    
    const closes = priceData.map(d => d.close || d);
    const rsi2 = this.calculateRSI(closes, 2);
    const rsi5 = this.calculateRSI(closes, 5);
    
    let action = 'skip';
    let confidence = 0.5;
    let reason = '';
    
    // Entry: RSI(2) < 10 = extremely oversold = BUY
    if (rsi2 < this.oversoldThreshold) {
      action = 'long';
      confidence = 0.78 + (10 - rsi2) * 0.01; // Higher confidence for lower RSI
      reason = `RSI(2)=${rsi2.toFixed(1)} < ${this.oversoldThreshold} (OVERSOLD)`;
    }
    // RSI(2) < 5 = even stronger signal
    else if (rsi2 < 5) {
      action = 'long';
      confidence = 0.85;
      reason = `RSI(2)=${rsi2.toFixed(1)} < 5 (EXTREME OVERSOLD)`;
    }
    // Exit signal: RSI > 70
    else if (rsi2 > this.overboughtThreshold) {
      action = 'short'; // Or close long
      confidence = 0.65;
      reason = `RSI(2)=${rsi2.toFixed(1)} > ${this.overboughtThreshold} (OVERBOUGHT)`;
    }
    // Neutral
    else {
      reason = `RSI(2)=${rsi2.toFixed(1)} (neutral zone)`;
    }
    
    logger.debug(`RSI2 ${asset}: RSI(2)=${rsi2.toFixed(1)}, RSI(5)=${rsi5.toFixed(1)} → ${action}`);
    
    return {
      action,
      confidence: Math.min(confidence, 0.95),
      rsi2,
      rsi5,
      reason,
      strategy: this.name
    };
  }

  getStats() {
    return {
      name: this.name,
      expectedWinRate: this.winRate,
      entryThreshold: this.oversoldThreshold,
      exitThreshold: this.overboughtThreshold
    };
  }
}

export default RSI2Strategy;
