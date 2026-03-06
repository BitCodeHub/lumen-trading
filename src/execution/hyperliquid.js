/**
 * Hyperliquid Exchange Connector for LUMEN ALPHA Trading Bot
 * 
 * Connects to Hyperliquid L1 for perpetual futures trading
 * Sub-second execution on crypto perpetuals
 */

import axios from 'axios';
import crypto from 'crypto-js';
import { logger } from '../utils/logger.js';

export class HyperliquidConnector {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.HYPERLIQUID_API_KEY;
    this.apiSecret = config.apiSecret || process.env.HYPERLIQUID_API_SECRET;
    this.testnet = config.testnet || process.env.HYPERLIQUID_TESTNET === 'true';
    
    this.baseUrl = this.testnet 
      ? 'https://api.hyperliquid-testnet.xyz'
      : 'https://api.hyperliquid.xyz';
    
    this.wsUrl = this.testnet
      ? 'wss://api.hyperliquid-testnet.xyz/ws'
      : 'wss://api.hyperliquid.xyz/ws';
    
    this.positions = new Map();
    this.orders = new Map();
    
    logger.info('Hyperliquid connector initialized', { 
      testnet: this.testnet,
      connected: !!this.apiKey
    });
  }
  
  /**
   * Check if connector is configured
   */
  isConfigured() {
    return !!(this.apiKey && this.apiSecret);
  }
  
  /**
   * Sign request for authenticated endpoints
   */
  signRequest(payload) {
    const timestamp = Date.now();
    const message = JSON.stringify(payload) + timestamp;
    const signature = crypto.HmacSHA256(message, this.apiSecret).toString();
    
    return {
      payload,
      timestamp,
      signature
    };
  }
  
  /**
   * Get account info
   */
  async getAccountInfo() {
    if (!this.isConfigured()) {
      return { error: 'Not configured - need API keys' };
    }
    
    try {
      const response = await axios.post(`${this.baseUrl}/info`, {
        type: 'userState',
        user: this.apiKey
      });
      
      return {
        equity: response.data.marginSummary?.accountValue || 0,
        freeMargin: response.data.marginSummary?.freeMargin || 0,
        positions: response.data.assetPositions || [],
        openOrders: response.data.orders || []
      };
    } catch (error) {
      logger.error('Failed to get account info', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Get current price for an asset
   */
  async getPrice(asset) {
    try {
      const response = await axios.post(`${this.baseUrl}/info`, {
        type: 'allMids'
      });
      
      const symbol = asset.replace('-PERP', '').toUpperCase();
      const price = response.data[symbol];
      
      return price ? parseFloat(price) : null;
    } catch (error) {
      logger.error('Failed to get price', { asset, error: error.message });
      throw error;
    }
  }
  
  /**
   * Place a market order
   */
  async placeOrder(params) {
    if (!this.isConfigured()) {
      throw new Error('Not configured - need API keys');
    }
    
    const { asset, side, size, reduceOnly = false } = params;
    const symbol = asset.replace('-PERP', '').toUpperCase();
    
    const order = {
      type: 'order',
      orders: [{
        a: this.getAssetIndex(symbol),
        b: side === 'buy',
        p: null, // Market order
        s: size.toString(),
        r: reduceOnly,
        t: { limit: { tif: 'Ioc' } }
      }],
      grouping: 'na'
    };
    
    try {
      const signed = this.signRequest(order);
      const response = await axios.post(`${this.baseUrl}/exchange`, signed);
      
      const result = {
        orderId: response.data.response?.data?.statuses?.[0]?.resting?.oid,
        asset,
        side,
        size,
        status: 'filled',
        timestamp: new Date().toISOString()
      };
      
      this.orders.set(result.orderId, result);
      logger.info('Order placed', result);
      
      return result;
    } catch (error) {
      logger.error('Failed to place order', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Close a position
   */
  async closePosition(asset) {
    const position = await this.getPosition(asset);
    if (!position || position.size === 0) {
      return { status: 'no_position' };
    }
    
    return this.placeOrder({
      asset,
      side: position.size > 0 ? 'sell' : 'buy',
      size: Math.abs(position.size),
      reduceOnly: true
    });
  }
  
  /**
   * Get position for an asset
   */
  async getPosition(asset) {
    const info = await this.getAccountInfo();
    const symbol = asset.replace('-PERP', '').toUpperCase();
    
    const position = info.positions?.find(p => 
      p.position?.coin?.toUpperCase() === symbol
    );
    
    if (!position) return null;
    
    return {
      asset,
      size: parseFloat(position.position?.szi || 0),
      entryPrice: parseFloat(position.position?.entryPx || 0),
      unrealizedPnl: parseFloat(position.position?.unrealizedPnl || 0),
      leverage: parseFloat(position.position?.leverage || 1)
    };
  }
  
  /**
   * Get all open positions
   */
  async getPositions() {
    const info = await this.getAccountInfo();
    return info.positions?.filter(p => 
      parseFloat(p.position?.szi || 0) !== 0
    ).map(p => ({
      asset: p.position?.coin,
      size: parseFloat(p.position?.szi || 0),
      entryPrice: parseFloat(p.position?.entryPx || 0),
      unrealizedPnl: parseFloat(p.position?.unrealizedPnl || 0)
    })) || [];
  }
  
  /**
   * Set leverage for an asset
   */
  async setLeverage(asset, leverage) {
    const symbol = asset.replace('-PERP', '').toUpperCase();
    
    const request = {
      type: 'updateLeverage',
      asset: this.getAssetIndex(symbol),
      isCross: true,
      leverage
    };
    
    try {
      const signed = this.signRequest(request);
      await axios.post(`${this.baseUrl}/exchange`, signed);
      logger.info('Leverage updated', { asset, leverage });
      return { success: true };
    } catch (error) {
      logger.error('Failed to set leverage', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Get asset index (Hyperliquid uses numeric indices)
   */
  getAssetIndex(symbol) {
    const indices = {
      'BTC': 0,
      'ETH': 1,
      'SOL': 2,
      'AVAX': 3,
      'DOGE': 4,
      'LINK': 5,
      'ARB': 6,
      'XRP': 7,
      // Add more as needed
    };
    return indices[symbol] ?? 0;
  }
  
  /**
   * Kill switch - close all positions
   */
  async killSwitch() {
    logger.warn('KILL SWITCH - Closing all positions');
    
    const positions = await this.getPositions();
    const results = [];
    
    for (const pos of positions) {
      try {
        const result = await this.closePosition(pos.asset);
        results.push({ asset: pos.asset, status: 'closed', result });
      } catch (error) {
        results.push({ asset: pos.asset, status: 'error', error: error.message });
      }
    }
    
    return results;
  }
}

export default HyperliquidConnector;
