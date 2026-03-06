/**
 * LUMEN ALPHA - Liquidation Cascade Detector
 * 
 * Monitors liquidations from Binance/Bybit to detect squeeze opportunities
 * FREE API - No signup required
 * 
 * Author: Unc Lumen (CTO) 💎
 */

import WebSocket from 'ws';
import { logger } from '../utils/logger.js';

// Track liquidations in rolling windows
const liquidationBuffer = {
  longs: [],   // { amount, timestamp }
  shorts: [],  // { amount, timestamp }
};

const WINDOW_MS = 60 * 60 * 1000; // 1 hour window

export class LiquidationDetector {
  constructor(config = {}) {
    this.name = 'liquidation';
    this.threshold = config.threshold || 50_000_000; // $50M in 1 hour = significant
    this.majorThreshold = config.majorThreshold || 100_000_000; // $100M = major event
    this.ws = null;
    this.isConnected = false;
    this.lastSignal = null;
    
    logger.info('LiquidationDetector initialized', {
      threshold: `$${(this.threshold / 1_000_000).toFixed(0)}M`,
      majorThreshold: `$${(this.majorThreshold / 1_000_000).toFixed(0)}M`
    });
  }

  /**
   * Connect to Binance liquidation websocket
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        // Binance forceOrder stream - ALL liquidations
        this.ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr');
        
        this.ws.on('open', () => {
          this.isConnected = true;
          logger.info('Connected to Binance liquidation stream');
          resolve(true);
        });
        
        this.ws.on('message', (data) => {
          try {
            const parsed = JSON.parse(data.toString());
            this.processLiquidation(parsed);
          } catch (e) {
            // Ignore parse errors
          }
        });
        
        this.ws.on('error', (error) => {
          logger.error('Liquidation websocket error:', error.message);
          this.isConnected = false;
        });
        
        this.ws.on('close', () => {
          this.isConnected = false;
          logger.warn('Liquidation websocket closed, reconnecting in 5s...');
          setTimeout(() => this.connect(), 5000);
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Process incoming liquidation event
   */
  processLiquidation(event) {
    if (!event.o) return;
    
    const order = event.o;
    const side = order.S; // BUY = short liquidation, SELL = long liquidation
    const amount = parseFloat(order.q) * parseFloat(order.p); // quantity * price
    const timestamp = Date.now();
    
    if (side === 'SELL') {
      // Long position liquidated (forced to sell)
      liquidationBuffer.longs.push({ amount, timestamp, symbol: order.s });
    } else {
      // Short position liquidated (forced to buy)
      liquidationBuffer.shorts.push({ amount, timestamp, symbol: order.s });
    }
    
    // Clean old entries
    this.cleanBuffer();
  }

  /**
   * Remove entries older than window
   */
  cleanBuffer() {
    const cutoff = Date.now() - WINDOW_MS;
    liquidationBuffer.longs = liquidationBuffer.longs.filter(l => l.timestamp > cutoff);
    liquidationBuffer.shorts = liquidationBuffer.shorts.filter(l => l.timestamp > cutoff);
  }

  /**
   * Get current liquidation totals
   */
  getTotals() {
    this.cleanBuffer();
    
    const longTotal = liquidationBuffer.longs.reduce((sum, l) => sum + l.amount, 0);
    const shortTotal = liquidationBuffer.shorts.reduce((sum, l) => sum + l.amount, 0);
    
    return {
      longs: longTotal,
      shorts: shortTotal,
      net: shortTotal - longTotal, // Positive = more shorts liquidated (bullish)
      ratio: longTotal > 0 ? shortTotal / longTotal : 1,
      longCount: liquidationBuffer.longs.length,
      shortCount: liquidationBuffer.shorts.length,
    };
  }

  /**
   * Generate trading signal based on liquidation cascade
   */
  async analyze(asset, priceData = {}, additionalData = {}) {
    const totals = this.getTotals();
    
    let action = 'skip';
    let confidence = 0.5;
    let reasoning = '';
    
    // Major long squeeze detected
    if (totals.longs > this.majorThreshold) {
      action = 'long';
      confidence = 0.75 + Math.min(0.20, (totals.longs - this.majorThreshold) / this.majorThreshold * 0.20);
      reasoning = `LONG SQUEEZE: $${(totals.longs / 1_000_000).toFixed(1)}M longs liquidated - BUY THE BOTTOM`;
      
      logger.info('🔥 MAJOR LONG SQUEEZE DETECTED', {
        longLiquidations: `$${(totals.longs / 1_000_000).toFixed(1)}M`,
        signal: 'LONG'
      });
    }
    // Major short squeeze detected
    else if (totals.shorts > this.majorThreshold) {
      action = 'short';
      confidence = 0.75 + Math.min(0.20, (totals.shorts - this.majorThreshold) / this.majorThreshold * 0.20);
      reasoning = `SHORT SQUEEZE: $${(totals.shorts / 1_000_000).toFixed(1)}M shorts liquidated - SELL THE TOP`;
      
      logger.info('🔥 MAJOR SHORT SQUEEZE DETECTED', {
        shortLiquidations: `$${(totals.shorts / 1_000_000).toFixed(1)}M`,
        signal: 'SHORT'
      });
    }
    // Significant long squeeze
    else if (totals.longs > this.threshold) {
      action = 'long';
      confidence = 0.60;
      reasoning = `Long squeeze: $${(totals.longs / 1_000_000).toFixed(1)}M liquidated - potential bounce`;
    }
    // Significant short squeeze  
    else if (totals.shorts > this.threshold) {
      action = 'short';
      confidence = 0.60;
      reasoning = `Short squeeze: $${(totals.shorts / 1_000_000).toFixed(1)}M liquidated - potential pullback`;
    }
    
    if (action === 'skip') {
      return null;
    }
    
    this.lastSignal = {
      action,
      confidence,
      reasoning,
      metadata: {
        strategy: 'liquidation',
        longLiquidations: totals.longs,
        shortLiquidations: totals.shorts,
        netFlow: totals.net,
        ratio: totals.ratio,
      }
    };
    
    return this.lastSignal;
  }

  /**
   * Get status for monitoring
   */
  getStatus() {
    const totals = this.getTotals();
    return {
      connected: this.isConnected,
      longLiquidations: `$${(totals.longs / 1_000_000).toFixed(2)}M`,
      shortLiquidations: `$${(totals.shorts / 1_000_000).toFixed(2)}M`,
      longCount: totals.longCount,
      shortCount: totals.shortCount,
      lastSignal: this.lastSignal,
    };
  }

  getStats() {
    return {
      name: this.name,
      connected: this.isConnected,
      threshold: this.threshold,
      ...this.getTotals()
    };
  }
}

export default LiquidationDetector;
