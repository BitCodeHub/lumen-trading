/**
 * Crypto Whale Intelligence - FREE Data Sources
 * 
 * Tracks whale activity using free APIs and public data
 */

import axios from 'axios';
import { logger } from '../utils/logger.js';

export class CryptoWhaleIntel {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 60 * 1000; // 1 minute
    
    // Free API endpoints
    this.apis = {
      // CoinGecko (already using)
      coingecko: 'https://api.coingecko.com/api/v3',
      // Blockchain.com for BTC
      blockchain: 'https://blockchain.info',
      // Alternative.me Fear & Greed
      fearGreed: 'https://api.alternative.me/fng/',
      // CryptoCompare
      cryptoCompare: 'https://min-api.cryptocompare.com/data',
    };
    
    logger.info('Crypto Whale Intel initialized');
  }

  /**
   * Get whale ratio signal (exchange inflows)
   * High whale ratio = potential selling pressure
   */
  async getWhaleSignal(symbol = 'BTC') {
    const cacheKey = `whale_${symbol}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.time < this.cacheExpiry) {
        return cached.data;
      }
    }

    try {
      // Use CryptoCompare social data as proxy for whale interest
      const socialRes = await axios.get(
        `${this.apis.cryptoCompare}/social/coin/latest?coinId=1182`, // BTC
        { timeout: 5000 }
      );
      
      const socialData = socialRes.data?.Data;
      
      // Analyze Reddit/Twitter activity as whale sentiment proxy
      const twitterFollowers = socialData?.Twitter?.followers || 0;
      const redditSubscribers = socialData?.Reddit?.subscribers || 0;
      const activeUsers = socialData?.Reddit?.active_users || 0;
      
      // Calculate sentiment score
      const activityRatio = activeUsers / (redditSubscribers || 1);
      
      let signal = 'neutral';
      let confidence = 0.5;
      
      if (activityRatio > 0.1) {
        signal = 'high_activity'; // Potential volatility
        confidence = 0.7;
      } else if (activityRatio < 0.02) {
        signal = 'low_activity'; // Accumulation phase
        confidence = 0.6;
      }
      
      const result = {
        signal,
        confidence,
        activityRatio: Math.round(activityRatio * 1000) / 1000,
        source: 'social_proxy'
      };
      
      this.cache.set(cacheKey, { data: result, time: Date.now() });
      return result;
    } catch (e) {
      return { signal: 'neutral', confidence: 0.5, error: e.message };
    }
  }

  /**
   * Get BTC mempool data (pending transactions)
   * High mempool = potential price movement
   */
  async getMempoolSignal() {
    try {
      const res = await axios.get(
        'https://mempool.space/api/mempool',
        { timeout: 5000 }
      );
      
      const count = res.data?.count || 0;
      const vsize = res.data?.vsize || 0;
      
      let signal = 'neutral';
      let confidence = 0.5;
      
      // High mempool activity = potential volatility
      if (count > 100000) {
        signal = 'congested';
        confidence = 0.65;
      } else if (count < 10000) {
        signal = 'clear';
        confidence = 0.6;
      }
      
      return {
        signal,
        confidence,
        pendingTxs: count,
        mempoolSize: Math.round(vsize / 1000000), // MB
        source: 'mempool'
      };
    } catch (e) {
      return { signal: 'neutral', confidence: 0.5, error: e.message };
    }
  }

  /**
   * Get large BTC transactions (whale moves)
   */
  async getLargeTransactions() {
    try {
      const res = await axios.get(
        'https://mempool.space/api/mempool/recent',
        { timeout: 5000 }
      );
      
      const txs = res.data || [];
      
      // Filter for large transactions (> 1 BTC)
      const largeTxs = txs.filter(tx => (tx.value || 0) > 100000000); // satoshis
      
      const whaleActivity = largeTxs.length;
      
      let signal = 'neutral';
      if (whaleActivity > 5) {
        signal = 'whale_active';
      } else if (whaleActivity === 0) {
        signal = 'whale_quiet';
      }
      
      return {
        signal,
        largeTxCount: whaleActivity,
        recentTxCount: txs.length,
        source: 'mempool_recent'
      };
    } catch (e) {
      return { signal: 'neutral', largeTxCount: 0, error: e.message };
    }
  }

  /**
   * Get exchange reserve data (proxy via price/volume)
   * High volume + price drop = exchange selling
   */
  async getExchangeFlowSignal(symbol = 'bitcoin') {
    try {
      const res = await axios.get(
        `${this.apis.coingecko}/coins/${symbol}/market_chart?vs_currency=usd&days=1`,
        { timeout: 5000 }
      );
      
      const volumes = res.data?.total_volumes || [];
      const prices = res.data?.prices || [];
      
      if (volumes.length < 2 || prices.length < 2) {
        return { signal: 'neutral', confidence: 0.5 };
      }
      
      // Compare recent vs earlier volume
      const recentVol = volumes.slice(-6).reduce((a, b) => a + b[1], 0) / 6;
      const earlierVol = volumes.slice(0, 6).reduce((a, b) => a + b[1], 0) / 6;
      const volChange = (recentVol - earlierVol) / (earlierVol || 1);
      
      // Price change
      const recentPrice = prices[prices.length - 1][1];
      const earlierPrice = prices[0][1];
      const priceChange = (recentPrice - earlierPrice) / earlierPrice;
      
      let signal = 'neutral';
      let confidence = 0.5;
      
      // High volume + price drop = potential whale selling
      if (volChange > 0.5 && priceChange < -0.01) {
        signal = 'whale_selling';
        confidence = 0.7;
      }
      // High volume + price up = whale buying
      else if (volChange > 0.5 && priceChange > 0.01) {
        signal = 'whale_buying';
        confidence = 0.7;
      }
      // Low volume = accumulation/distribution
      else if (volChange < -0.3) {
        signal = 'low_volume';
        confidence = 0.55;
      }
      
      return {
        signal,
        confidence,
        volumeChange: Math.round(volChange * 100) / 100,
        priceChange: Math.round(priceChange * 10000) / 100, // percentage
        source: 'volume_analysis'
      };
    } catch (e) {
      return { signal: 'neutral', confidence: 0.5, error: e.message };
    }
  }

  /**
   * Get combined whale intelligence signal
   */
  async getCombinedSignal(symbol = 'BTC') {
    const [whaleSignal, mempoolSignal, exchangeSignal] = await Promise.all([
      this.getWhaleSignal(symbol),
      this.getMempoolSignal(),
      this.getExchangeFlowSignal(symbol.toLowerCase() === 'btc' ? 'bitcoin' : 'ethereum')
    ]);

    // Combine signals
    const signals = {
      whale: whaleSignal,
      mempool: mempoolSignal,
      exchange: exchangeSignal
    };

    // Determine overall direction
    let bullishCount = 0;
    let bearishCount = 0;

    if (exchangeSignal.signal === 'whale_buying') bullishCount++;
    if (exchangeSignal.signal === 'whale_selling') bearishCount++;
    if (whaleSignal.signal === 'low_activity') bullishCount++; // Accumulation
    if (whaleSignal.signal === 'high_activity') bearishCount++; // Potential dump

    let overallSignal = 'neutral';
    let confidence = 0.5;

    if (bullishCount > bearishCount) {
      overallSignal = 'bullish';
      confidence = 0.6 + (bullishCount * 0.1);
    } else if (bearishCount > bullishCount) {
      overallSignal = 'bearish';
      confidence = 0.6 + (bearishCount * 0.1);
    }

    return {
      overall: {
        signal: overallSignal,
        confidence: Math.min(confidence, 0.85)
      },
      signals,
      timestamp: new Date().toISOString()
    };
  }
}

export default CryptoWhaleIntel;
