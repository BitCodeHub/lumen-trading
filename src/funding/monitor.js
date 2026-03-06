/**
 * LUMEN ALPHA - Funding Rate & Open Interest Monitor
 * 
 * Detects overleveraged markets that are ripe for squeezes
 * FREE APIs - Binance + Bybit
 * 
 * Author: Unc Lumen (CTO) 💎
 */

import axios from 'axios';
import { logger } from '../utils/logger.js';

// Funding rate thresholds
const EXTREME_POSITIVE = 0.001;  // 0.1% per 8h = bullish crowded (short squeeze risk)
const EXTREME_NEGATIVE = -0.001; // -0.1% per 8h = bearish crowded (long squeeze risk)
const VERY_EXTREME = 0.002;      // 0.2% = very crowded

export class FundingRateMonitor {
  constructor(config = {}) {
    this.name = 'fundingRate';
    this.cache = {};
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    logger.info('FundingRateMonitor initialized');
  }

  /**
   * Get funding rate from Binance
   */
  async getBinanceFunding(symbol) {
    try {
      const response = await axios.get(
        `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}USDT&limit=1`,
        { timeout: 5000 }
      );
      
      if (response.data && response.data.length > 0) {
        return {
          rate: parseFloat(response.data[0].fundingRate),
          time: response.data[0].fundingTime,
          source: 'binance'
        };
      }
    } catch (error) {
      // Silently fail, will try Bybit
    }
    return null;
  }

  /**
   * Get funding rate from Bybit
   */
  async getBybitFunding(symbol) {
    try {
      const response = await axios.get(
        `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}USDT&limit=1`,
        { timeout: 5000 }
      );
      
      if (response.data?.result?.list?.length > 0) {
        return {
          rate: parseFloat(response.data.result.list[0].fundingRate),
          time: response.data.result.list[0].fundingRateTimestamp,
          source: 'bybit'
        };
      }
    } catch (error) {
      // Silently fail
    }
    return null;
  }

  /**
   * Get open interest from Binance
   */
  async getOpenInterest(symbol) {
    try {
      const response = await axios.get(
        `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}USDT`,
        { timeout: 5000 }
      );
      
      if (response.data) {
        return {
          openInterest: parseFloat(response.data.openInterest),
          source: 'binance'
        };
      }
    } catch (error) {
      // Silently fail
    }
    return null;
  }

  /**
   * Get combined funding rate (prefer Binance, fallback Bybit)
   */
  async getFundingRate(symbol) {
    const normalizedSymbol = symbol.replace('-PERP', '').replace('USDT', '').toUpperCase();
    
    // Check cache
    const cacheKey = `funding_${normalizedSymbol}`;
    if (this.cache[cacheKey] && Date.now() - this.cache[cacheKey].time < this.cacheExpiry) {
      return this.cache[cacheKey].data;
    }
    
    // Try Binance first
    let funding = await this.getBinanceFunding(normalizedSymbol);
    
    // Fallback to Bybit
    if (!funding) {
      funding = await this.getBybitFunding(normalizedSymbol);
    }
    
    // Get open interest
    const oi = await this.getOpenInterest(normalizedSymbol);
    
    if (funding) {
      const result = {
        symbol: normalizedSymbol,
        fundingRate: funding.rate,
        annualizedRate: funding.rate * 3 * 365 * 100, // Convert to annual %
        openInterest: oi?.openInterest || null,
        source: funding.source,
        timestamp: Date.now()
      };
      
      this.cache[cacheKey] = { data: result, time: Date.now() };
      return result;
    }
    
    return null;
  }

  /**
   * Analyze funding rate for trading signals
   */
  async analyze(asset, priceData = {}, additionalData = {}) {
    const funding = await this.getFundingRate(asset);
    
    if (!funding) {
      return null;
    }
    
    const rate = funding.fundingRate;
    let action = 'skip';
    let confidence = 0.5;
    let reasoning = '';
    
    // Extreme positive funding = shorts paying longs = crowded long (short squeeze likely)
    if (rate > VERY_EXTREME) {
      action = 'short'; // Contrarian - fade the crowd
      confidence = 0.70;
      reasoning = `🔥 EXTREME funding +${(rate * 100).toFixed(3)}% - Market overleveraged LONG, fade the crowd`;
      
      logger.info('Extreme positive funding detected', {
        asset,
        rate: `${(rate * 100).toFixed(4)}%`,
        signal: 'SHORT (fade crowded longs)'
      });
    }
    else if (rate > EXTREME_POSITIVE) {
      action = 'short';
      confidence = 0.58;
      reasoning = `High funding +${(rate * 100).toFixed(3)}% - Longs paying shorts, potential pullback`;
    }
    // Extreme negative funding = longs paying shorts = crowded short (long squeeze likely)
    else if (rate < -VERY_EXTREME) {
      action = 'long'; // Contrarian - fade the crowd
      confidence = 0.70;
      reasoning = `🔥 EXTREME funding ${(rate * 100).toFixed(3)}% - Market overleveraged SHORT, fade the crowd`;
      
      logger.info('Extreme negative funding detected', {
        asset,
        rate: `${(rate * 100).toFixed(4)}%`,
        signal: 'LONG (fade crowded shorts)'
      });
    }
    else if (rate < EXTREME_NEGATIVE) {
      action = 'long';
      confidence = 0.58;
      reasoning = `Low funding ${(rate * 100).toFixed(3)}% - Shorts paying longs, potential bounce`;
    }
    
    if (action === 'skip') {
      return null;
    }
    
    return {
      action,
      confidence,
      reasoning,
      metadata: {
        strategy: 'fundingRate',
        fundingRate: rate,
        annualizedRate: funding.annualizedRate,
        openInterest: funding.openInterest,
        source: funding.source
      }
    };
  }

  getStats() {
    return {
      name: this.name,
      cachedSymbols: Object.keys(this.cache).length,
      thresholds: {
        extremePositive: EXTREME_POSITIVE,
        extremeNegative: EXTREME_NEGATIVE
      }
    };
  }
}

export default FundingRateMonitor;
