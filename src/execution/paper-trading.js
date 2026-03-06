/**
 * Paper Trading Executor for LUMEN ALPHA Trading Bot
 * 
 * Simulates trades without real money
 * Used for validation before going live
 * 
 * NOW WITH PERSISTENCE - state survives restarts!
 */

import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '../../data/paper-state.json');

export class PaperTrading {
  constructor(initialCapital = 1000) {
    this.initialCapital = initialCapital;
    this.equity = initialCapital;
    this.cash = initialCapital;
    this.positions = new Map();
    this.trades = [];
    this.halted = false;
    
    // Load persisted state on startup
    this.loadState();
    
    logger.info('Paper Trading initialized', { 
      initialCapital, 
      loadedEquity: this.equity,
      openPositions: this.positions.size,
      totalTrades: this.trades.length
    });
  }
  
  /**
   * Load state from file
   */
  loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        this.equity = data.equity || this.initialCapital;
        this.cash = data.cash || this.initialCapital;
        this.trades = data.trades || [];
        this.halted = data.halted || false;
        
        // Restore positions map
        if (data.positions && Array.isArray(data.positions)) {
          this.positions = new Map(data.positions.map(p => [p.id, p]));
        }
        
        logger.info('📂 Loaded paper trading state', {
          equity: this.equity.toFixed(2),
          positions: this.positions.size,
          trades: this.trades.length
        });
      }
    } catch (error) {
      logger.warn('Could not load paper trading state, starting fresh', { error: error.message });
    }
  }
  
  /**
   * Save state to file
   */
  saveState() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(STATE_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      const state = {
        equity: this.equity,
        cash: this.cash,
        initialCapital: this.initialCapital,
        halted: this.halted,
        positions: Array.from(this.positions.values()),
        trades: this.trades,
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      logger.debug('💾 Saved paper trading state');
    } catch (error) {
      logger.error('Failed to save paper trading state', { error: error.message });
    }
  }
  
  /**
   * Execute a paper trade
   */
  async execute(analysis) {
    if (this.halted) {
      throw new Error('Trading is halted');
    }
    
    if (analysis.action === 'skip') {
      return { status: 'skipped', reason: analysis.reason || 'No action' };
    }
    
    const trade = {
      id: `paper_${Date.now()}`,
      asset: analysis.asset,
      action: analysis.action,
      side: analysis.action === 'long' ? 'buy' : 'sell',
      price: analysis.entryPrice || await this.getSimulatedPrice(analysis.asset),
      size: analysis.positionSizeUsd || 20, // Default $20
      stopLoss: analysis.stopLoss,
      takeProfit: analysis.takeProfit,
      strategy: analysis.strategy,
      confidence: analysis.confidence,
      timestamp: new Date().toISOString(),
      status: 'open'
    };
    
    // Check if we have enough cash
    if (trade.size > this.cash) {
      return { status: 'rejected', reason: 'Insufficient cash' };
    }
    
    // Open position
    this.positions.set(trade.id, trade);
    this.cash -= trade.size;
    this.trades.push(trade);
    
    // PERSIST STATE
    this.saveState();
    
    logger.info('Paper trade executed', trade);
    
    return trade;
  }
  
  /**
   * Close a position (called by PositionMonitor when SL/TP hit)
   */
  closePosition(positionId, closeData) {
    const position = this.positions.get(positionId);
    if (!position) {
      logger.warn(`Position ${positionId} not found`);
      return null;
    }
    
    // Update position with close data
    position.status = 'closed';
    position.exitPrice = closeData.exitPrice;
    position.pnl = closeData.pnl;
    position.pnlPercent = closeData.pnlPercent;
    position.outcome = closeData.reason;
    position.closedAt = new Date().toISOString();
    
    // Update cash and equity
    this.cash += position.size + position.pnl;
    this.positions.delete(positionId);
    this.equity = this.cash + this.getOpenPositionsValue();
    
    // Update trade in history
    const tradeIndex = this.trades.findIndex(t => t.id === positionId);
    if (tradeIndex !== -1) {
      this.trades[tradeIndex] = { ...this.trades[tradeIndex], ...position };
    }
    
    // PERSIST STATE
    this.saveState();
    
    logger.info('Paper trade closed by PositionMonitor', {
      id: positionId,
      asset: position.asset,
      outcome: closeData.reason,
      pnl: position.pnl.toFixed(2),
      equity: this.equity.toFixed(2)
    });
    
    return position;
  }
  
  /**
   * Get REAL price from live market data (no hardcoding!)
   */
  async getSimulatedPrice(asset) {
    // Try to get REAL price from live markets
    try {
      const { priceFeeds } = await import('../data/price-feeds.js');
      const realPrice = await priceFeeds.getPrice(asset);
      
      if (realPrice) {
        console.log(`📈 REAL PRICE ${asset}: $${realPrice.toFixed(2)}`);
        return realPrice;
      }
    } catch (error) {
      console.log(`⚠️ Price feed unavailable for ${asset}, using fallback`);
    }
    
    // Fallback ONLY if real price unavailable (market closed, etc)
    const basePrices = {
      'BTC': 67000,
      'ETH': 3500,
      'SOL': 140,
      'XRP': 2.50,
      'AVAX': 38.00,
      'SPY': 520,
      'AAPL': 175,
      'NVDA': 890,
      'AMZN': 178,
      'COIN': 285
    };
    
    console.log(`⚠️ Using fallback price for ${asset}`);
    return basePrices[asset.replace('-PERP', '')] || 100;
  }
  
  /**
   * Get all open positions
   */
  getPositions() {
    return Array.from(this.positions.values());
  }
  
  /**
   * Get total value of open positions
   */
  getOpenPositionsValue() {
    let total = 0;
    for (const pos of this.positions.values()) {
      total += pos.size;
    }
    return total;
  }
  
  /**
   * Get current equity
   */
  getEquity() {
    return this.equity;
  }
  
  /**
   * Get PnL
   */
  getPnL() {
    const closedTrades = this.trades.filter(t => t.status === 'closed');
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winCount = closedTrades.filter(t => (t.pnl || 0) > 0).length;
    const lossCount = closedTrades.filter(t => (t.pnl || 0) <= 0).length;
    
    return {
      total: totalPnL,
      percent: (totalPnL / this.initialCapital * 100).toFixed(2),
      trades: closedTrades.length,
      wins: winCount,
      losses: lossCount,
      winRate: closedTrades.length > 0 ? (winCount / closedTrades.length * 100).toFixed(1) : 0
    };
  }
  
  /**
   * Kill switch - close all positions and halt
   */
  killSwitch() {
    // Close all positions at current price (simulated loss)
    for (const [id, pos] of this.positions) {
      pos.status = 'closed';
      pos.exitPrice = pos.price * 0.99; // 1% slippage
      pos.pnl = -pos.size * 0.01;
      pos.outcome = 'kill_switch';
      pos.closedAt = new Date().toISOString();
      
      this.cash += pos.size + pos.pnl;
    }
    
    this.positions.clear();
    this.equity = this.cash;
    this.halted = true;
    
    // PERSIST STATE
    this.saveState();
    
    logger.warn('KILL SWITCH - All positions closed');
    
    return {
      status: 'halted',
      equity: this.equity,
      pnl: this.getPnL()
    };
  }
  
  /**
   * Resume trading
   */
  resume() {
    this.halted = false;
    this.saveState();
    logger.info('Paper trading resumed');
  }
  
  /**
   * Get trade history
   */
  getHistory() {
    return this.trades;
  }
  
  /**
   * Reset state (for testing)
   */
  reset() {
    this.equity = this.initialCapital;
    this.cash = this.initialCapital;
    this.positions.clear();
    this.trades = [];
    this.halted = false;
    this.saveState();
    logger.info('Paper trading state reset');
  }
}

export default PaperTrading;
