/**
 * Market Regime Detector for LUMEN ALPHA
 * 
 * Detects overall market conditions (Bull/Bear/Sideways)
 * Adjusts trading strategy based on regime
 */

import axios from 'axios';
import { logger } from '../utils/logger.js';

export class RegimeDetector {
  constructor() {
    // BTC as market proxy
    this.btcEndpoint = 'https://api.binance.com/api/v3';
    
    // Regime thresholds
    this.thresholds = {
      strongBull: 10,    // >10% gain in lookback = strong bull
      bull: 3,           // >3% gain = bull
      bear: -3,          // <-3% = bear
      strongBear: -10,   // <-10% = strong bear
    };
    
    // Lookback periods (days)
    this.lookbackDays = 14;
    
    // Cache
    this.regimeCache = null;
    this.cacheExpiry = 15 * 60 * 1000; // 15 minutes
    this.lastUpdate = 0;
    
    logger.info('Regime Detector initialized');
  }

  /**
   * Get current market regime
   */
  async getRegime() {
    if (this.regimeCache && Date.now() - this.lastUpdate < this.cacheExpiry) {
      return this.regimeCache;
    }

    try {
      const regime = await this.detectRegime();
      this.regimeCache = regime;
      this.lastUpdate = Date.now();
      return regime;
    } catch (error) {
      logger.warn('Regime detection failed', { error: error.message });
      return this.getDefaultRegime();
    }
  }

  /**
   * Detect market regime using BTC as proxy
   */
  async detectRegime() {
    // Get BTC price history
    const klines = await this.getBTCKlines();
    
    if (!klines || klines.length < 2) {
      return this.getDefaultRegime();
    }

    // Calculate metrics
    const currentPrice = parseFloat(klines[klines.length - 1][4]); // Close price
    const startPrice = parseFloat(klines[0][1]); // Open price
    const priceChange = ((currentPrice - startPrice) / startPrice) * 100;
    
    // Calculate volatility (standard deviation of daily returns)
    const dailyReturns = [];
    for (let i = 1; i < klines.length; i++) {
      const prevClose = parseFloat(klines[i - 1][4]);
      const currClose = parseFloat(klines[i][4]);
      dailyReturns.push((currClose - prevClose) / prevClose);
    }
    const volatility = this.standardDeviation(dailyReturns) * Math.sqrt(365) * 100;

    // Determine regime
    let regime, confidence;
    
    if (priceChange > this.thresholds.strongBull) {
      regime = 'strong_bull';
      confidence = 0.85;
    } else if (priceChange > this.thresholds.bull) {
      regime = 'bull';
      confidence = 0.70;
    } else if (priceChange < this.thresholds.strongBear) {
      regime = 'strong_bear';
      confidence = 0.85;
    } else if (priceChange < this.thresholds.bear) {
      regime = 'bear';
      confidence = 0.70;
    } else {
      regime = 'sideways';
      confidence = 0.60;
    }

    // Get strategy adjustments for this regime
    const strategy = this.getStrategyForRegime(regime);

    return {
      regime,
      confidence,
      priceChange: priceChange.toFixed(2),
      volatility: volatility.toFixed(2),
      btcPrice: currentPrice,
      strategy,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get BTC klines (try CoinGecko first, then Binance)
   */
  async getBTCKlines() {
    // Try CoinGecko first (no geo-restrictions)
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=${this.lookbackDays}`,
        { timeout: 5000 }
      );
      // CoinGecko format: [timestamp, open, high, low, close]
      return response.data.map(d => [d[0], d[1].toString(), d[2].toString(), d[3].toString(), d[4].toString()]);
    } catch (error) {
      logger.debug('CoinGecko failed, trying Binance', { error: error.message });
    }
    
    // Fallback to Binance
    try {
      const response = await axios.get(
        `${this.btcEndpoint}/klines?symbol=BTCUSDT&interval=1d&limit=${this.lookbackDays}`,
        { timeout: 5000 }
      );
      return response.data;
    } catch (error) {
      logger.warn('Failed to fetch BTC klines from all sources', { error: error.message });
      return null;
    }
  }

  /**
   * Calculate standard deviation
   */
  standardDeviation(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Get trading strategy adjustments for regime
   */
  getStrategyForRegime(regime) {
    const strategies = {
      strong_bull: {
        mode: 'aggressive_long',
        positionMultiplier: 1.5,     // 50% larger positions
        longBias: 0.8,               // 80% long bias
        shortEnabled: false,         // No shorts in strong bull
        stopLossMultiplier: 1.2,     // Wider stops
        takeProfitMultiplier: 1.5,   // Higher targets
        confidenceThreshold: 0.50,   // Lower bar for longs
        description: 'Strong bull - aggressive long positions, no shorts',
      },
      bull: {
        mode: 'long_bias',
        positionMultiplier: 1.2,
        longBias: 0.65,
        shortEnabled: true,
        stopLossMultiplier: 1.0,
        takeProfitMultiplier: 1.2,
        confidenceThreshold: 0.55,
        description: 'Bull market - favor longs, selective shorts',
      },
      sideways: {
        mode: 'neutral',
        positionMultiplier: 0.8,     // Smaller positions
        longBias: 0.50,              // No bias
        shortEnabled: true,
        stopLossMultiplier: 0.8,     // Tighter stops
        takeProfitMultiplier: 0.8,   // Lower targets
        confidenceThreshold: 0.60,   // Higher bar
        description: 'Sideways - reduced positions, range trading',
      },
      bear: {
        mode: 'short_bias',
        positionMultiplier: 0.8,
        longBias: 0.35,              // Short bias
        shortEnabled: true,
        stopLossMultiplier: 0.8,
        takeProfitMultiplier: 1.0,
        confidenceThreshold: 0.60,
        description: 'Bear market - favor shorts, selective longs',
      },
      strong_bear: {
        mode: 'defensive',
        positionMultiplier: 0.5,     // Much smaller positions
        longBias: 0.2,               // Strong short bias
        shortEnabled: true,
        stopLossMultiplier: 0.6,     // Very tight stops
        takeProfitMultiplier: 1.2,   // Quick profits
        confidenceThreshold: 0.70,   // Very high bar
        description: 'Strong bear - defensive, tight stops, favor cash',
      },
    };

    return strategies[regime] || strategies.sideways;
  }

  /**
   * Default regime when detection fails
   */
  getDefaultRegime() {
    return {
      regime: 'sideways',
      confidence: 0.50,
      priceChange: '0.00',
      volatility: '50.00',
      btcPrice: 0,
      strategy: this.getStrategyForRegime('sideways'),
      timestamp: new Date().toISOString(),
      default: true,
    };
  }
}
