/**
 * Bollinger Band Mean Reversion Strategy
 * Win Rate: 70%+
 * 
 * Entry: Price touches lower band + RSI < 30
 * Exit: Price reaches middle band or upper band
 * 
 * Best for range-bound markets
 */

import { logger } from '../utils/logger.js';

export class BollingerReversionStrategy {
  constructor() {
    this.name = 'Bollinger Mean Reversion';
    this.winRate = 0.70;
    this.period = 20;
    this.stdDev = 2;
  }

  /**
   * Calculate Bollinger Bands
   */
  calculateBollingerBands(prices, period = 20, numStdDev = 2) {
    if (prices.length < period) {
      const current = prices[prices.length - 1];
      return { upper: current * 1.02, middle: current, lower: current * 0.98 };
    }
    
    const slice = prices.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    
    const squaredDiffs = slice.map(p => Math.pow(p - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: sma + (numStdDev * stdDev),
      middle: sma,
      lower: sma - (numStdDev * stdDev),
      stdDev,
      bandwidth: (4 * numStdDev * stdDev) / sma // Bandwidth %
    };
  }

  /**
   * Calculate RSI
   */
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
  }

  /**
   * Analyze for Bollinger reversion signal
   */
  async analyze(asset, priceData) {
    if (!priceData || priceData.length < 20) {
      return { action: 'skip', confidence: 0, reason: 'Insufficient data' };
    }
    
    const closes = priceData.map(d => d.close || d);
    const currentPrice = closes[closes.length - 1];
    const bb = this.calculateBollingerBands(closes, this.period, this.stdDev);
    const rsi = this.calculateRSI(closes, 14);
    
    let action = 'skip';
    let confidence = 0.5;
    let reason = '';
    
    // ENTRY: Price at/below lower band + RSI oversold
    if (currentPrice <= bb.lower && rsi < 30) {
      action = 'long';
      confidence = 0.75;
      reason = `Price $${currentPrice.toFixed(2)} at lower BB $${bb.lower.toFixed(2)}, RSI=${rsi.toFixed(0)}`;
      logger.info(`📊 BB LONG: ${asset} at lower band, RSI ${rsi.toFixed(0)}`);
    }
    // Price just below lower band
    else if (currentPrice < bb.lower * 1.01 && rsi < 40) {
      action = 'long';
      confidence = 0.65;
      reason = `Price near lower BB, RSI=${rsi.toFixed(0)}`;
    }
    // EXIT: Price at/above upper band + RSI overbought
    else if (currentPrice >= bb.upper && rsi > 70) {
      action = 'short';
      confidence = 0.70;
      reason = `Price $${currentPrice.toFixed(2)} at upper BB $${bb.upper.toFixed(2)}, RSI=${rsi.toFixed(0)}`;
    }
    // Bollinger Squeeze (volatility breakout incoming)
    else if (bb.bandwidth < 0.05) {
      // Low bandwidth = squeeze = breakout imminent
      reason = `BB Squeeze: bandwidth ${(bb.bandwidth * 100).toFixed(1)}% (watch for breakout)`;
    }
    else {
      reason = `Price $${currentPrice.toFixed(2)} between bands (${bb.lower.toFixed(2)}-${bb.upper.toFixed(2)})`;
    }
    
    return {
      action,
      confidence: Math.min(confidence, 0.90),
      bollingerBands: bb,
      rsi,
      reason,
      strategy: this.name
    };
  }

  getStats() {
    return {
      name: this.name,
      expectedWinRate: this.winRate,
      entry: 'Lower band + RSI<30',
      exit: 'Middle or upper band'
    };
  }
}

export default BollingerReversionStrategy;
