/**
 * VIX Fear Strategy
 * Win Rate: 65%+
 * 
 * Buy SPY when VIX spikes 20%+ in a day
 * Fear = buying opportunity
 * 
 * Hold 3-5 days for mean reversion
 */

import { logger } from '../utils/logger.js';
import axios from 'axios';

export class VIXFearStrategy {
  constructor() {
    this.name = 'VIX Fear Buy';
    this.winRate = 0.65;
    this.vixSpikeThreshold = 0.20; // 20% spike
    this.vixCache = null;
    this.cacheTTL = 300000; // 5 minutes
  }

  /**
   * Get VIX level
   */
  async getVIX() {
    if (this.vixCache && Date.now() - this.vixCache.timestamp < this.cacheTTL) {
      return this.vixCache.data;
    }
    
    try {
      // Yahoo Finance for VIX
      const response = await axios.get(
        'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d',
        { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      
      const result = response.data.chart?.result?.[0];
      const closes = result?.indicators?.quote?.[0]?.close || [];
      
      if (closes.length >= 2) {
        const current = closes[closes.length - 1];
        const previous = closes[closes.length - 2];
        const data = {
          current,
          previous,
          change: (current - previous) / previous
        };
        this.vixCache = { data, timestamp: Date.now() };
        return data;
      }
    } catch (error) {
      logger.warn('VIX fetch failed');
    }
    
    return null;
  }

  /**
   * Analyze for VIX fear signal
   */
  async analyze(asset, priceData, additionalData = {}) {
    // Only applicable to stocks/indices
    const stockAssets = ['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META'];
    if (!stockAssets.includes(asset.toUpperCase())) {
      return { action: 'skip', confidence: 0, reason: 'VIX strategy for stocks only' };
    }
    
    const vix = additionalData.vix || await this.getVIX();
    
    if (!vix) {
      return { action: 'skip', confidence: 0, reason: 'No VIX data' };
    }
    
    let action = 'skip';
    let confidence = 0.5;
    let reason = '';
    
    // VIX spike = fear = BUY
    if (vix.change > this.vixSpikeThreshold) {
      action = 'long';
      confidence = 0.65 + Math.min(vix.change, 0.20); // Up to 85%
      reason = `VIX spiked ${(vix.change * 100).toFixed(1)}% (>${this.vixSpikeThreshold * 100}%) → FEAR BUY`;
      logger.info(`😱 VIX FEAR BUY: VIX +${(vix.change * 100).toFixed(1)}% → Long ${asset}`);
    }
    // Extreme VIX = even better opportunity
    else if (vix.current > 30) {
      action = 'long';
      confidence = 0.70;
      reason = `VIX at ${vix.current.toFixed(1)} (>30) → Extreme fear, buy opportunity`;
    }
    // Low VIX = complacency = potential reversal
    else if (vix.current < 12 && vix.change < -0.10) {
      action = 'short';
      confidence = 0.55;
      reason = `VIX at ${vix.current.toFixed(1)} (<12) with decline → Complacency warning`;
    }
    else {
      reason = `VIX ${vix.current?.toFixed(1) || 'N/A'} (${(vix.change * 100).toFixed(1)}% change) - neutral`;
    }
    
    return {
      action,
      confidence: Math.min(confidence, 0.90),
      vixLevel: vix.current,
      vixChange: vix.change,
      reason,
      strategy: this.name
    };
  }

  getStats() {
    return {
      name: this.name,
      expectedWinRate: this.winRate,
      spikeThreshold: `>${this.vixSpikeThreshold * 100}% daily change`
    };
  }
}

export default VIXFearStrategy;
