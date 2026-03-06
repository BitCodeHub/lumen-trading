/**
 * Bybit Exchange Connector for LUMEN ALPHA Trading Bot
 * 
 * Connects to Bybit for spot and futures trading
 */

import axios from 'axios';
import crypto from 'crypto-js';
import { logger } from '../utils/logger.js';

export class BybitConnector {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.BYBIT_API_KEY;
    this.apiSecret = config.apiSecret || process.env.BYBIT_API_SECRET;
    this.testnet = config.testnet || process.env.BYBIT_TESTNET === 'true';
    
    this.baseUrl = this.testnet 
      ? 'https://api-testnet.bybit.com'
      : 'https://api.bybit.com';
    
    logger.info('Bybit connector initialized', { 
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
   * Generate signature for authenticated requests
   */
  sign(params) {
    const timestamp = Date.now();
    const recvWindow = 5000;
    
    const paramStr = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    
    const signStr = `${timestamp}${this.apiKey}${recvWindow}${paramStr}`;
    const signature = crypto.HmacSHA256(signStr, this.apiSecret).toString();
    
    return {
      'X-BAPI-API-KEY': this.apiKey,
      'X-BAPI-TIMESTAMP': timestamp.toString(),
      'X-BAPI-RECV-WINDOW': recvWindow.toString(),
      'X-BAPI-SIGN': signature
    };
  }
  
  /**
   * Make authenticated request
   */
  async request(method, endpoint, params = {}) {
    const headers = this.sign(params);
    
    try {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers,
        ...(method === 'GET' ? { params } : { data: params })
      };
      
      const response = await axios(config);
      
      if (response.data.retCode !== 0) {
        throw new Error(response.data.retMsg || 'Bybit API error');
      }
      
      return response.data.result;
    } catch (error) {
      logger.error('Bybit request failed', { endpoint, error: error.message });
      throw error;
    }
  }
  
  /**
   * Get account balance
   */
  async getBalance() {
    if (!this.isConfigured()) {
      return { error: 'Not configured - need API keys' };
    }
    
    const result = await this.request('GET', '/v5/account/wallet-balance', {
      accountType: 'UNIFIED'
    });
    
    return {
      totalEquity: parseFloat(result.list?.[0]?.totalEquity || 0),
      availableBalance: parseFloat(result.list?.[0]?.totalAvailableBalance || 0),
      coins: result.list?.[0]?.coin || []
    };
  }
  
  /**
   * Get current price
   */
  async getPrice(symbol) {
    try {
      const response = await axios.get(`${this.baseUrl}/v5/market/tickers`, {
        params: { category: 'linear', symbol }
      });
      
      const ticker = response.data.result?.list?.[0];
      return ticker ? parseFloat(ticker.lastPrice) : null;
    } catch (error) {
      logger.error('Failed to get price', { symbol, error: error.message });
      throw error;
    }
  }
  
  /**
   * Place order
   */
  async placeOrder(params) {
    if (!this.isConfigured()) {
      throw new Error('Not configured - need API keys');
    }
    
    const { symbol, side, qty, orderType = 'Market', reduceOnly = false } = params;
    
    const order = {
      category: 'linear',
      symbol,
      side: side.charAt(0).toUpperCase() + side.slice(1), // Buy/Sell
      orderType,
      qty: qty.toString(),
      reduceOnly
    };
    
    const result = await this.request('POST', '/v5/order/create', order);
    
    logger.info('Order placed on Bybit', { orderId: result.orderId, ...order });
    
    return {
      orderId: result.orderId,
      symbol,
      side,
      qty,
      status: 'submitted'
    };
  }
  
  /**
   * Get positions
   */
  async getPositions(symbol = null) {
    if (!this.isConfigured()) {
      return [];
    }
    
    const params = { category: 'linear' };
    if (symbol) params.symbol = symbol;
    
    const result = await this.request('GET', '/v5/position/list', params);
    
    return (result.list || []).map(p => ({
      symbol: p.symbol,
      side: p.side,
      size: parseFloat(p.size),
      entryPrice: parseFloat(p.avgPrice),
      unrealizedPnl: parseFloat(p.unrealisedPnl),
      leverage: parseFloat(p.leverage)
    }));
  }
  
  /**
   * Close position
   */
  async closePosition(symbol) {
    const positions = await this.getPositions(symbol);
    const position = positions.find(p => p.symbol === symbol && p.size > 0);
    
    if (!position) {
      return { status: 'no_position' };
    }
    
    return this.placeOrder({
      symbol,
      side: position.side === 'Buy' ? 'Sell' : 'Buy',
      qty: position.size,
      reduceOnly: true
    });
  }
  
  /**
   * Set leverage
   */
  async setLeverage(symbol, leverage) {
    await this.request('POST', '/v5/position/set-leverage', {
      category: 'linear',
      symbol,
      buyLeverage: leverage.toString(),
      sellLeverage: leverage.toString()
    });
    
    logger.info('Leverage set on Bybit', { symbol, leverage });
    return { success: true };
  }
  
  /**
   * Kill switch - close all positions
   */
  async killSwitch() {
    logger.warn('BYBIT KILL SWITCH - Closing all positions');
    
    const positions = await this.getPositions();
    const results = [];
    
    for (const pos of positions) {
      if (pos.size > 0) {
        try {
          const result = await this.closePosition(pos.symbol);
          results.push({ symbol: pos.symbol, status: 'closed', result });
        } catch (error) {
          results.push({ symbol: pos.symbol, status: 'error', error: error.message });
        }
      }
    }
    
    return results;
  }
}

export default BybitConnector;
