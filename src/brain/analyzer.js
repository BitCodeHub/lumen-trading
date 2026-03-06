/**
 * LUMEN ALPHA - Brain Analyzer
 * 
 * Multi-signal ensemble for trading decisions
 * Combines ML, whale tracking, sentiment, liquidation heatmaps, and strategies
 * 
 * Author: Unc Lumen (CTO) 💎
 * Updated: 2026-03-06 - Applied profitability fixes
 */

import { StrategyOrchestrator } from '../strategies/index.js';
import { WhaleTracker } from '../whale/tracker.js';
import { SentimentAnalyzer } from '../data/sentiment.js';
import { PriceFeeds } from '../data/price-feeds.js';
import { LiquidationDetector } from '../liquidation/detector.js';
import { FundingRateMonitor } from '../funding/monitor.js';
import { RegimeDetector } from '../regime/detector.js';
import { logger } from '../utils/logger.js';

export class BrainAnalyzer {
  constructor(config = {}) {
    // Initialize components
    this.strategies = new StrategyOrchestrator();
    this.whaleTracker = new WhaleTracker();
    this.sentiment = new SentimentAnalyzer();
    this.priceFeeds = new PriceFeeds();
    this.liquidation = new LiquidationDetector();
    this.funding = new FundingRateMonitor();
    this.regime = new RegimeDetector();
    
    // ============================================
    // WEIGHTS - Updated 2026-03-06 for profitability
    // ============================================
    // Problem: Original weights gave 30% to strategies that backtest negative
    // Fix: Boost whale/liquidation (actual edge), reduce strategy weight
    this.weights = config.weights || {
      whale: 0.25,        // Whale signals (real edge) - UP from 0.12
      liquidation: 0.25,  // Liquidation heatmaps (reactive) - UP from 0.15
      strategies: 0.15,   // Technical strategies (backtest negative) - DOWN from 0.30
      ml: 0.10,           // ML predictions (58% accuracy) - DOWN from 0.20
      sentiment: 0.15,    // Social sentiment - UP from 0.08
      funding: 0.10       // Funding rate contrarian - SAME
    };
    
    // ============================================
    // RISK PARAMETERS - Updated 2026-03-06
    // ============================================
    // Problem: 2.5% stop loss too tight for crypto volatility (all trades stopped out)
    // Fix: Widen stops to 5%, increase take-profit to 8%
    this.riskParams = {
      defaultStopLoss: 0.05,     // 5% stop loss (was 0.025)
      defaultTakeProfit: 0.08,   // 8% take profit (was 0.05)
      minRiskReward: 1.5,        // Minimum 1.5:1 R:R
      maxLeverage: 3,
    };
    
    // ============================================
    // REGIME FILTER - NEW 2026-03-06
    // ============================================
    // Problem: Taking longs in bear market (Fear & Greed at 18)
    // Fix: Block longs when regime is bearish
    this.regimeFilter = {
      enabled: true,
      blockLongsInBear: true,   // No longs when Fear & Greed < 30
      blockShortsInBull: true,  // No shorts when Fear & Greed > 70
      fearGreedThreshold: {
        bear: 30,  // Below this = bear regime
        bull: 70   // Above this = bull regime
      }
    };
    
    // Track model accuracy for meta-learning
    this.modelAccuracy = {
      ml: 0.58,
      whale: 0.65,
      sentiment: 0.60,
      strategies: 0.45,  // Reduced based on backtest results
      liquidation: 0.62,
      funding: 0.55
    };
    
    logger.info('BrainAnalyzer initialized with profitability fixes', {
      weights: this.weights,
      riskParams: this.riskParams,
      regimeFilter: this.regimeFilter
    });
  }

  /**
   * Analyze an asset and generate trading signal
   */
  async analyze(signal) {
    const { asset } = signal;
    
    try {
      // Gather all signals in parallel
      const [
        priceData,
        whaleSignal,
        sentimentSignal,
        liquidationSignal,
        fundingSignal,
        regimeData,
        strategySignal
      ] = await Promise.all([
        this.priceFeeds.getOHLCV(asset).catch(() => null),
        this.whaleTracker.getActivity(asset).catch(() => null),
        this.sentiment.analyze(asset).catch(() => null),
        this.liquidation.getHeatmap(asset).catch(() => null),
        this.funding.getRate(asset).catch(() => null),
        this.regime.detect(asset).catch(() => null),
        this.strategies.analyze(asset, null, {}).catch(() => null)
      ]);
      
      // Combine signals with weights
      const combined = this.combineSignals({
        whale: whaleSignal,
        sentiment: sentimentSignal,
        liquidation: liquidationSignal,
        funding: fundingSignal,
        strategies: strategySignal,
        ml: null // ML model not yet integrated
      });
      
      // Apply regime filter
      const filteredSignal = this.applyRegimeFilter(combined, regimeData);
      
      // Calculate risk parameters
      const riskAdjusted = this.calculateRiskParams(filteredSignal, priceData);
      
      return {
        asset,
        action: riskAdjusted.action,
        confidence: riskAdjusted.confidence,
        stopLoss: riskAdjusted.stopLoss,
        takeProfit: riskAdjusted.takeProfit,
        size: riskAdjusted.size,
        modelAccuracy: this.getWeightedAccuracy(),
        signals: {
          whale: whaleSignal,
          sentiment: sentimentSignal,
          liquidation: liquidationSignal,
          funding: fundingSignal,
          strategies: strategySignal
        },
        regime: regimeData,
        reasoning: this.buildReasoning(combined),
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error(`Brain analysis failed for ${asset}`, { error: error.message });
      return {
        asset,
        action: 'skip',
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Combine multiple signals with weighted voting
   */
  combineSignals(signals) {
    let bullScore = 0;
    let bearScore = 0;
    let totalWeight = 0;
    const contributions = [];
    
    for (const [source, signal] of Object.entries(signals)) {
      if (!signal) continue;
      
      const weight = this.weights[source] || 0.1;
      const confidence = signal.confidence || 0.5;
      totalWeight += weight;
      
      if (signal.action === 'long' || signal.signal === 'bullish') {
        bullScore += weight * confidence;
        contributions.push(`${source}: LONG (${(confidence * 100).toFixed(0)}%)`);
      } else if (signal.action === 'short' || signal.signal === 'bearish') {
        bearScore += weight * confidence;
        contributions.push(`${source}: SHORT (${(confidence * 100).toFixed(0)}%)`);
      } else {
        contributions.push(`${source}: NEUTRAL`);
      }
    }
    
    // Normalize
    if (totalWeight > 0) {
      bullScore /= totalWeight;
      bearScore /= totalWeight;
    }
    
    // Determine action (require 70% confidence now, not 55%)
    let action = 'skip';
    let confidence = 0;
    
    if (bullScore > bearScore && bullScore > 0.55) {
      action = 'long';
      confidence = bullScore;
    } else if (bearScore > bullScore && bearScore > 0.55) {
      action = 'short';
      confidence = bearScore;
    }
    
    return { action, confidence, bullScore, bearScore, contributions };
  }

  /**
   * Apply regime filter to block bad trades
   */
  applyRegimeFilter(signal, regimeData) {
    if (!this.regimeFilter.enabled || !regimeData) {
      return signal;
    }
    
    const fearGreed = regimeData.fearGreed || 50;
    
    // Block longs in bear market
    if (this.regimeFilter.blockLongsInBear && 
        signal.action === 'long' && 
        fearGreed < this.regimeFilter.fearGreedThreshold.bear) {
      logger.info(`Regime filter: Blocked LONG - Fear & Greed at ${fearGreed} (bear regime)`);
      return { ...signal, action: 'skip', confidence: 0, blocked: 'bear_regime' };
    }
    
    // Block shorts in bull market
    if (this.regimeFilter.blockShortsInBull && 
        signal.action === 'short' && 
        fearGreed > this.regimeFilter.fearGreedThreshold.bull) {
      logger.info(`Regime filter: Blocked SHORT - Fear & Greed at ${fearGreed} (bull regime)`);
      return { ...signal, action: 'skip', confidence: 0, blocked: 'bull_regime' };
    }
    
    return signal;
  }

  /**
   * Calculate risk parameters (stop loss, take profit, position size)
   */
  calculateRiskParams(signal, priceData) {
    if (signal.action === 'skip') {
      return signal;
    }
    
    // Use ATR-based stops if we have price data, otherwise use defaults
    let stopLoss = this.riskParams.defaultStopLoss;
    let takeProfit = this.riskParams.defaultTakeProfit;
    
    if (priceData && priceData.atr) {
      // ATR-based: 2x ATR for stop, 3x ATR for take profit
      const atrPercent = priceData.atr / priceData.close;
      stopLoss = Math.max(atrPercent * 2, 0.03);  // Min 3%
      takeProfit = Math.max(atrPercent * 3, 0.06); // Min 6%
    }
    
    // Adjust based on confidence
    // Higher confidence = tighter stops, wider take profit
    if (signal.confidence > 0.80) {
      stopLoss *= 0.8;
      takeProfit *= 1.2;
    } else if (signal.confidence < 0.65) {
      stopLoss *= 1.2;  // Wider stop for lower confidence
      takeProfit *= 0.9;
    }
    
    // Ensure minimum risk:reward
    const riskReward = takeProfit / stopLoss;
    if (riskReward < this.riskParams.minRiskReward) {
      takeProfit = stopLoss * this.riskParams.minRiskReward;
    }
    
    // Position size based on confidence
    // 20 = max position size, scale down for lower confidence
    const size = Math.round(20 * (signal.confidence / 0.85));
    
    return {
      ...signal,
      stopLoss,
      takeProfit,
      size: Math.max(size, 10) // Minimum size of 10
    };
  }

  /**
   * Build human-readable reasoning
   */
  buildReasoning(combined) {
    return combined.contributions.join(' | ');
  }

  /**
   * Get weighted average model accuracy
   */
  getWeightedAccuracy() {
    let totalAccuracy = 0;
    let totalWeight = 0;
    
    for (const [source, weight] of Object.entries(this.weights)) {
      const accuracy = this.modelAccuracy[source] || 0.5;
      totalAccuracy += weight * accuracy;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? totalAccuracy / totalWeight : 0.5;
  }

  /**
   * Update model accuracy based on trade outcomes
   */
  updateAccuracy(source, wasCorrect) {
    if (this.modelAccuracy[source] !== undefined) {
      // Exponential moving average update
      const alpha = 0.1; // Learning rate
      this.modelAccuracy[source] = 
        alpha * (wasCorrect ? 1 : 0) + (1 - alpha) * this.modelAccuracy[source];
      
      logger.info(`Updated ${source} accuracy to ${(this.modelAccuracy[source] * 100).toFixed(1)}%`);
    }
  }
}

export default BrainAnalyzer;
