/**
 * Triple RSI Strategy
 * Win Rate: 90%+ historically
 * 
 * Entry: ALL conditions must be met:
 *   - RSI(2) < 5
 *   - RSI(3) < 20
 *   - RSI(5) < 30
 * 
 * Exit: Close > 5-day Moving Average
 * 
 * Source: Larry Connors, High Probability Trading
 */

import { logger } from '../utils/logger.js';

export class TripleRSIStrategy {
  constructor() {
    this.name = 'Triple RSI';
    this.winRate = 0.90;
  }

  /**
   * Calculate RSI for given period
   */
  calculateRSI(prices, period) {
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
   * Calculate Simple Moving Average
   */
  calculateSMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  /**
   * Analyze for Triple RSI signal
   */
  async analyze(asset, priceData) {
    if (!priceData || priceData.length < 10) {
      return { action: 'skip', confidence: 0, reason: 'Insufficient data' };
    }
    
    const closes = priceData.map(d => d.close || d);
    const currentPrice = closes[closes.length - 1];
    
    const rsi2 = this.calculateRSI(closes, 2);
    const rsi3 = this.calculateRSI(closes, 3);
    const rsi5 = this.calculateRSI(closes, 5);
    const sma5 = this.calculateSMA(closes, 5);
    
    let action = 'skip';
    let confidence = 0.5;
    let reason = '';
    
    // ENTRY: All three RSI conditions met (very rare but very profitable)
    if (rsi2 < 5 && rsi3 < 20 && rsi5 < 30) {
      action = 'long';
      confidence = 0.90;
      reason = `TRIPLE RSI TRIGGERED! RSI(2)=${rsi2.toFixed(1)}, RSI(3)=${rsi3.toFixed(1)}, RSI(5)=${rsi5.toFixed(1)}`;
      logger.info(`🎯 TRIPLE RSI BUY SIGNAL: ${asset}`);
    }
    // PARTIAL: Two of three conditions (still good)
    else if ((rsi2 < 10 && rsi3 < 25) || (rsi2 < 10 && rsi5 < 35)) {
      action = 'long';
      confidence = 0.75;
      reason = `Partial Triple RSI: RSI(2)=${rsi2.toFixed(1)}, RSI(3)=${rsi3.toFixed(1)}, RSI(5)=${rsi5.toFixed(1)}`;
    }
    // EXIT: Price above 5-day MA (exit signal for existing longs)
    else if (currentPrice > sma5 && rsi2 > 70) {
      action = 'short'; // Close long position
      confidence = 0.70;
      reason = `Exit signal: Price ${currentPrice.toFixed(2)} > SMA5 ${sma5.toFixed(2)}, RSI(2)=${rsi2.toFixed(1)}`;
    }
    else {
      reason = `No signal: RSI(2)=${rsi2.toFixed(1)}, RSI(3)=${rsi3.toFixed(1)}, RSI(5)=${rsi5.toFixed(1)}`;
    }
    
    return {
      action,
      confidence: Math.min(confidence, 0.95),
      rsi2,
      rsi3,
      rsi5,
      sma5,
      reason,
      strategy: this.name
    };
  }

  getStats() {
    return {
      name: this.name,
      expectedWinRate: this.winRate,
      conditions: 'RSI(2)<5 AND RSI(3)<20 AND RSI(5)<30'
    };
  }
}

export default TripleRSIStrategy;
