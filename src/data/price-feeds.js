/**
 * Real-Time Price Feeds for LUMEN ALPHA Trading Bot
 * 
 * Fetches LIVE prices from free public APIs
 * No API key required for price data
 */

import axios from 'axios';
import { logger } from '../utils/logger.js';

// Price cache to reduce API calls
const priceCache = new Map();
const CACHE_TTL = 60000; // 60 seconds - longer cache for position monitoring

export class PriceFeeds {
  constructor() {
    this.sources = {
      crypto: 'binance',  // Free, no API key
      stocks: 'yahoo'     // Free, no API key
    };
    
    logger.info('Price Feeds initialized (REAL-TIME, no hardcoded data)');
  }
  
  /**
   * Get real-time price for any asset
   */
  async getPrice(asset) {
    // Check cache first
    const cached = priceCache.get(asset);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.price;
    }
    
    let price;
    
    // Determine if crypto or stock
    // Expanded crypto list - all major coins
    const cryptoAssets = [
      'BTC', 'ETH', 'XRP', 'SOL', 'AVAX', 'DOGE', 'LINK', 'ARB', 'MATIC', 'ADA',
      'BNB', 'TRX', 'LEO', 'TON', 'DOT', 'SHIB', 'LTC', 'BCH', 'ATOM', 'UNI',
      'XLM', 'ETC', 'HBAR', 'INJ', 'ICP', 'FIL', 'APT', 'NEAR', 'OP', 'VET',
      'MKR', 'AAVE', 'RUNE', 'GRT', 'ALGO', 'QNT', 'FTM', 'EGLD', 'FLOW', 'SAND',
      'AXS', 'CHZ', 'MANA', 'GALA', 'ENJ', 'CRV', 'LDO', 'RPL', 'RNDR', 'IMX',
      'WIF', 'PEPE', 'BONK', 'FLOKI', 'ORDI', 'SATS', '1000SATS'
    ];
    const symbol = asset.replace('-PERP', '').toUpperCase();
    const isCrypto = cryptoAssets.includes(symbol);
    
    if (isCrypto) {
      price = await this.getCryptoPrice(asset);
    } else {
      // Try crypto first, then fall back to stock
      price = await this.getCryptoPrice(asset);
      if (!price) {
        price = await this.getStockPrice(asset);
      }
    }
    
    // Cache the result
    if (price) {
      priceCache.set(asset, { price, timestamp: Date.now() });
      return price;
    }
    
    // If API failed but we have stale cache, use that (better than nothing)
    const staleCache = priceCache.get(asset);
    if (staleCache) {
      logger.warn(`Using stale cached price for ${asset}: $${staleCache.price}`);
      return staleCache.price;
    }
    
    return null;
  }
  
  /**
   * Get crypto price from multiple sources (Binance blocked, use alternatives)
   */
  async getCryptoPrice(asset) {
    const symbol = asset.replace('-PERP', '').toUpperCase();
    
    // Try CoinGecko first (more reliable, no geo-restrictions)
    const geckoPrice = await this.getCoinGeckoPrice(symbol);
    if (geckoPrice) return geckoPrice;
    
    // Fallback to Binance (may be geo-blocked)
    const binanceSymbol = symbol + 'USDT';
    
    try {
      const response = await axios.get(
        `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
        { timeout: 5000 }
      );
      
      const price = parseFloat(response.data.price);
      logger.debug(`Real price ${asset}: $${price}`);
      return price;
    } catch (error) {
      // Fallback to CoinGecko
      return this.getCryptoPriceCoinGecko(asset);
    }
  }
  
  /**
   * Primary: KuCoin (free, no rate limits, no geo-restrictions)
   */
  async getCoinGeckoPrice(asset) {
    // Try KuCoin first (most reliable)
    const kucoinPrice = await this.getKuCoinPrice(asset);
    if (kucoinPrice) return kucoinPrice;
    
    // Fallback to CoinGecko
    return this.getCryptoPriceCoinGecko(asset);
  }
  
  /**
   * KuCoin price feed (free, reliable, no restrictions)
   */
  async getKuCoinPrice(asset) {
    const symbol = asset.replace('-PERP', '').toUpperCase() + '-USDT';
    
    try {
      const response = await axios.get(
        `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${symbol}`,
        { timeout: 5000 }
      );
      
      if (response.data?.code === '200000' && response.data?.data?.price) {
        const price = parseFloat(response.data.data.price);
        logger.debug(`KuCoin price ${asset}: $${price}`);
        return price;
      }
      return null;
    } catch (error) {
      logger.warn(`KuCoin price fetch failed for ${asset}`);
      return null;
    }
  }
  
  /**
   * CoinGecko implementation (free, no API key)
   */
  async getCryptoPriceCoinGecko(asset) {
    const coinIds = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'XRP': 'ripple',
      'SOL': 'solana',
      'AVAX': 'avalanche-2',
      'DOGE': 'dogecoin',
      'LINK': 'chainlink',
      'ARB': 'arbitrum',
      'MATIC': 'matic-network',
      'ADA': 'cardano',
      'BNB': 'binancecoin',
      'TRX': 'tron',
      'LEO': 'leo-token',
      'TON': 'the-open-network',
      'DOT': 'polkadot',
      'SHIB': 'shiba-inu',
      'LTC': 'litecoin',
      'BCH': 'bitcoin-cash',
      'ATOM': 'cosmos',
      'UNI': 'uniswap',
      'HBAR': 'hedera-hashgraph',
      'ICP': 'internet-computer',
      'APT': 'aptos',
      'NEAR': 'near',
      'PEPE': 'pepe',
      'AAVE': 'aave',
      'JUP': 'jupiter-exchange-solana',
      'OP': 'optimism',
      'INJ': 'injective-protocol',
      'FTM': 'fantom',
      'ALGO': 'algorand',
      'WIF': 'dogwifcoin',
      'BONK': 'bonk',
      'FLOKI': 'floki',
      'RENDER': 'render-token',
      'FET': 'fetch-ai',
      'SUI': 'sui',
      'SEI': 'sei-network',
      'TIA': 'celestia'
    };
    
    const coinId = coinIds[asset.replace('-PERP', '').toUpperCase()];
    if (!coinId) return null;
    
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
        { timeout: 5000 }
      );
      
      return response.data[coinId]?.usd || null;
    } catch (error) {
      logger.warn(`CoinGecko price fetch failed for ${asset}`);
      return null;
    }
  }
  
  /**
   * Get stock price from Yahoo Finance (free, no API key)
   */
  async getStockPrice(symbol) {
    try {
      // Yahoo Finance chart API (free)
      const response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`,
        { 
          timeout: 5000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }
      );
      
      const result = response.data.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice;
      
      if (price) {
        logger.debug(`Real price ${symbol}: $${price}`);
        return price;
      }
      return null;
    } catch (error) {
      logger.warn(`Yahoo price fetch failed for ${symbol}`);
      return null;
    }
  }
  
  /**
   * Get multiple prices at once
   */
  async getPrices(assets) {
    const prices = {};
    
    await Promise.all(
      assets.map(async (asset) => {
        prices[asset] = await this.getPrice(asset);
      })
    );
    
    return prices;
  }
  
  /**
   * Get OHLCV data for ML models
   */
  async getOHLCV(asset, limit = 24) {
    const symbol = asset.replace('-PERP', '').toUpperCase();
    const isCrypto = ['BTC', 'ETH', 'XRP', 'SOL', 'AVAX'].includes(symbol);
    
    if (isCrypto) {
      return this.getCryptoOHLCV(symbol, limit);
    } else {
      return this.getStockOHLCV(symbol, limit);
    }
  }
  
  /**
   * Get crypto OHLCV from Binance
   */
  async getCryptoOHLCV(symbol, limit) {
    try {
      const response = await axios.get(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1h&limit=${limit}`,
        { timeout: 5000 }
      );
      
      return response.data.map(k => ({
        timestamp: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));
    } catch (error) {
      logger.error(`Failed to get OHLCV for ${symbol}`);
      return null;
    }
  }
  
  /**
   * Get stock OHLCV from Yahoo
   */
  async getStockOHLCV(symbol, limit) {
    try {
      const response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1h&range=5d`,
        { 
          timeout: 5000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }
      );
      
      const result = response.data.chart?.result?.[0];
      if (!result) return null;
      
      const timestamps = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0] || {};
      
      return timestamps.slice(-limit).map((ts, i) => ({
        timestamp: ts * 1000,
        open: quotes.open?.[i] || 0,
        high: quotes.high?.[i] || 0,
        low: quotes.low?.[i] || 0,
        close: quotes.close?.[i] || 0,
        volume: quotes.volume?.[i] || 0
      }));
    } catch (error) {
      logger.error(`Failed to get OHLCV for ${symbol}`);
      return null;
    }
  }
}

export const priceFeeds = new PriceFeeds();
export default PriceFeeds;
