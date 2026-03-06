/**
 * Risk Manager for LUMEN ALPHA Trading Bot
 * 
 * HARDCODED LIMITS - These cannot be overridden by AI or config
 * This is the safety layer that protects capital
 */

import { logger } from '../utils/logger.js';

export class RiskManager {
  constructor(limits) {
    // HARDCODED - Cannot be changed
    this.limits = Object.freeze({
      maxPositionSize: 0.02,        // 2% max per trade
      maxLeverage: 3,               // 3x max
      maxOpenPositions: 5,          // Concurrent positions
      dailyLossLimit: 0.03,         // 3% daily
      weeklyLossLimit: 0.08,        // 8% weekly
      circuitBreaker: 0.05,         // 5% drawdown = halt
      requireApproval: 500,         // Human approval > $500
      autoBenchAfterLosses: 3,      // Bench after 3 losses
    });
    
    this.state = {
      halted: false,
      haltReason: null,
      haltedAt: null,
      dailyPnL: 0,
      weeklyPnL: 0,
      openPositions: 0,
      totalEquity: 1000, // Will be updated from executor
      consecutiveLosses: {},
      benchedStrategies: new Set(),
      trades: []
    };
    
    logger.info('Risk Manager initialized', { limits: this.limits });
  }
  
  /**
   * Check if a trade is allowed
   * Returns { approved: boolean, reason?: string }
   */
  checkTrade(analysis) {
    // 1. Check if halted
    if (this.state.halted) {
      return { approved: false, reason: `Trading halted: ${this.state.haltReason}` };
    }
    
    // 2. Check circuit breaker
    if (this.state.dailyPnL <= -this.limits.circuitBreaker * this.state.totalEquity) {
      this.halt('Circuit breaker triggered - 5% daily drawdown');
      return { approved: false, reason: 'Circuit breaker triggered' };
    }
    
    // 3. Check daily loss limit
    if (this.state.dailyPnL <= -this.limits.dailyLossLimit * this.state.totalEquity) {
      return { approved: false, reason: 'Daily loss limit reached' };
    }
    
    // 4. Check weekly loss limit
    if (this.state.weeklyPnL <= -this.limits.weeklyLossLimit * this.state.totalEquity) {
      return { approved: false, reason: 'Weekly loss limit reached' };
    }
    
    // 5. Check max positions
    if (this.state.openPositions >= this.limits.maxOpenPositions) {
      return { approved: false, reason: 'Max open positions reached' };
    }
    
    // 6. Check position size
    const positionSize = analysis.positionSizeUsd || analysis.positionSize || 20;
    const maxAllowed = this.limits.maxPositionSize * this.state.totalEquity;
    if (positionSize > maxAllowed) {
      return { 
        approved: false, 
        reason: `Position too large: $${positionSize} > $${maxAllowed.toFixed(2)} (2% limit)` 
      };
    }
    
    // 7. Check if strategy is benched
    const strategy = analysis.strategy || 'default';
    if (this.state.benchedStrategies.has(strategy)) {
      return { approved: false, reason: `Strategy '${strategy}' is benched` };
    }
    
    // 8. Check if requires human approval
    if (positionSize > this.limits.requireApproval) {
      return { 
        approved: false, 
        reason: `Trade > $${this.limits.requireApproval} requires human approval`,
        requiresApproval: true,
        trade: analysis
      };
    }
    
    // All checks passed
    return { 
      approved: true,
      positionSize: Math.min(positionSize, maxAllowed),
      riskPercent: (positionSize / this.state.totalEquity * 100).toFixed(2)
    };
  }
  
  /**
   * Record trade outcome for strategy management
   */
  recordTrade(trade) {
    this.state.trades.push({
      ...trade,
      timestamp: new Date().toISOString()
    });
    
    // Update PnL
    const pnl = trade.pnl || 0;
    this.state.dailyPnL += pnl;
    this.state.weeklyPnL += pnl;
    
    // Track consecutive losses
    const strategy = trade.strategy || 'default';
    if (pnl < 0) {
      this.state.consecutiveLosses[strategy] = (this.state.consecutiveLosses[strategy] || 0) + 1;
      
      // Check if should bench
      if (this.state.consecutiveLosses[strategy] >= this.limits.autoBenchAfterLosses) {
        this.benchStrategy(strategy);
      }
    } else {
      // Reset on win
      this.state.consecutiveLosses[strategy] = 0;
    }
    
    logger.info('Trade recorded', { trade, dailyPnL: this.state.dailyPnL });
  }
  
  /**
   * Bench a strategy for 7 days
   */
  benchStrategy(strategy) {
    this.state.benchedStrategies.add(strategy);
    logger.warn(`Strategy benched: ${strategy}`);
    
    // Auto-unban after 7 days
    setTimeout(() => {
      this.state.benchedStrategies.delete(strategy);
      this.state.consecutiveLosses[strategy] = 0;
      logger.info(`Strategy unbenched: ${strategy}`);
    }, 7 * 24 * 60 * 60 * 1000);
  }
  
  /**
   * Halt all trading (circuit breaker or manual)
   */
  halt(reason = 'Manual halt') {
    this.state.halted = true;
    this.state.haltReason = reason;
    this.state.haltedAt = new Date().toISOString();
    logger.error('TRADING HALTED', { reason });
  }
  
  /**
   * Resume trading (after cooldown)
   */
  resume() {
    this.state.halted = false;
    this.state.haltReason = null;
    this.state.haltedAt = null;
    logger.info('Trading resumed');
  }
  
  /**
   * Update equity from executor
   */
  updateEquity(equity) {
    this.state.totalEquity = equity;
  }
  
  /**
   * Update position count
   */
  updatePositions(count) {
    this.state.openPositions = count;
  }
  
  /**
   * Get current risk metrics
   */
  getMetrics() {
    return {
      halted: this.state.halted,
      haltReason: this.state.haltReason,
      dailyPnL: this.state.dailyPnL,
      dailyPnLPercent: (this.state.dailyPnL / this.state.totalEquity * 100).toFixed(2),
      weeklyPnL: this.state.weeklyPnL,
      openPositions: this.state.openPositions,
      maxPositions: this.limits.maxOpenPositions,
      benchedStrategies: Array.from(this.state.benchedStrategies),
      limits: this.limits
    };
  }
  
  /**
   * Reset daily stats (call at midnight)
   */
  resetDaily() {
    this.state.dailyPnL = 0;
    logger.info('Daily stats reset');
  }
  
  /**
   * Reset weekly stats (call on Sunday)
   */
  resetWeekly() {
    this.state.weeklyPnL = 0;
    logger.info('Weekly stats reset');
  }
}

export default RiskManager;
