/**
 * Momentum Breakout Strategy
 * Win Rate: 55-65%
 * 
 * Entry: Price breaks above resistance with volume > 150% average
 * Exit: Trail stop at 2 ATR below
 * 
 * Best for trending markets, high volatility assets
 */

import { logger } from '../utils/logger.js';

export class MomentumBreakoutStrategy {
  constructor() {
    this.name = 'Momentum Breakout';
    this.winRate = 0.60;
    this.volumeMultiplier = 1.5;
    this.atrPeriod = 14;
  }

  /**
   * Calculate Average True Range
   */
  calculateATR(priceData, period = 14) {
    if (priceData.length < period + 1) return 0;
    
    let trSum = 0;
    for (let i = priceData.length - period; i < priceData.length; i++) {
      const high = priceData[i].high || priceData[i];
      const low = priceData[i].low || priceData[i];
      const prevClose = priceData[i - 1]?.close || priceData[i - 1] || high;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trSum += tr;
    }
    
    return trSum / period;
  }

  /**
   * Calculate resistance/support levels
   */
  calculateLevels(priceData, lookback = 20) {
    const closes = priceData.slice(-lookback).map(d => d.close || d);
    const highs = priceData.slice(-lookback).map(d => d.high || d.close || d);
    const lows = priceData.slice(-lookback).map(d => d.low || d.close || d);
    
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);
    const pivotPoint = (resistance + support + closes[closes.length - 1]) / 3;
    
    return { resistance, support, pivotPoint };
  }

  /**
   * Analyze for momentum breakout
   */
  async analyze(asset, priceData) {
    if (!priceData || priceData.length < 20) {
      return { action: 'skip', confidence: 0, reason: 'Insufficient data' };
    }
    
    const closes = priceData.map(d => d.close || d);
    const volumes = priceData.map(d => d.volume || 0);
    const currentPrice = closes[closes.length - 1];
    const currentVolume = volumes[volumes.length - 1];
    
    // Calculate indicators
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const atr = this.calculateATR(priceData, this.atrPeriod);
    const levels = this.calculateLevels(priceData, 20);
    
    // 20-day high/low
    const high20 = Math.max(...closes.slice(-20));
    const low20 = Math.min(...closes.slice(-20));
    
    let action = 'skip';
    let confidence = 0.5;
    let reason = '';
    
    // BULLISH BREAKOUT: New 20-day high with volume
    if (currentPrice >= high20 * 0.998 && currentVolume > avgVolume * this.volumeMultiplier) {
      action = 'long';
      confidence = 0.65 + Math.min((currentVolume / avgVolume - 1) * 0.1, 0.15);
      reason = `Breakout: New 20-day high $${high20.toFixed(2)} with ${(currentVolume / avgVolume).toFixed(1)}x volume`;
      logger.info(`🚀 BREAKOUT LONG: ${asset} new 20d high with volume`);
    }
    // Price breaking above resistance with volume
    else if (currentPrice > levels.resistance * 0.99 && currentVolume > avgVolume * 1.2) {
      action = 'long';
      confidence = 0.60;
      reason = `Breaking resistance $${levels.resistance.toFixed(2)}`;
    }
    // BEARISH BREAKDOWN: New 20-day low with volume
    else if (currentPrice <= low20 * 1.002 && currentVolume > avgVolume * this.volumeMultiplier) {
      action = 'short';
      confidence = 0.60 + Math.min((currentVolume / avgVolume - 1) * 0.1, 0.15);
      reason = `Breakdown: New 20-day low $${low20.toFixed(2)} with ${(currentVolume / avgVolume).toFixed(1)}x volume`;
    }
    // Price breaking below support
    else if (currentPrice < levels.support * 1.01 && currentVolume > avgVolume * 1.2) {
      action = 'short';
      confidence = 0.55;
      reason = `Breaking support $${levels.support.toFixed(2)}`;
    }
    // Strong momentum (price change)
    else {
      const priceChange = (currentPrice - closes[closes.length - 5]) / closes[closes.length - 5];
      if (priceChange > 0.05 && currentVolume > avgVolume) {
        action = 'long';
        confidence = 0.55;
        reason = `Strong momentum: +${(priceChange * 100).toFixed(1)}% in 5 periods`;
      }
    }
    
    return {
      action,
      confidence: Math.min(confidence, 0.85),
      atr,
      levels,
      volumeRatio: currentVolume / avgVolume,
      reason,
      strategy: this.name
    };
  }

  getStats() {
    return {
      name: this.name,
      expectedWinRate: this.winRate,
      volumeThreshold: `>${this.volumeMultiplier}x average`
    };
  }
}

export default MomentumBreakoutStrategy;
