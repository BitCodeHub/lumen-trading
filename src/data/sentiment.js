/**
 * Sentiment Analyzer for LUMEN ALPHA Trading Bot
 * 
 * Monitors social media and news for market sentiment
 * Integrates with Elim's FinBERT model on DGX Spark
 */

import axios from 'axios';
import { logger } from '../utils/logger.js';

// High-influence accounts to monitor
const INFLUENTIAL_ACCOUNTS = [
  '@POTUS',
  '@elonmusk',
  '@federalreserve',
  '@whale_alert',
  '@DefiLlama',
  '@tier10k',
  '@CryptoQuant',
  '@santaborromir'
];

// Keywords that often move markets
const MARKET_KEYWORDS = [
  'interest rates',
  'rate cut',
  'rate hike',
  'SEC crypto',
  'Bitcoin ETF',
  'Ethereum upgrade',
  'hack',
  'exploit',
  'regulation',
  'ban',
  'adoption',
  'whale',
  'liquidation'
];

export class SentimentAnalyzer {
  constructor(config = {}) {
    this.mlEndpoint = config.mlEndpoint || 'http://100.79.93.27:5000';
    this.enabled = config.enabled || true;
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    this.accounts = config.accounts || INFLUENTIAL_ACCOUNTS;
    this.keywords = config.keywords || MARKET_KEYWORDS;
    
    logger.info('Sentiment Analyzer initialized', {
      mlEndpoint: this.mlEndpoint,
      accounts: this.accounts.length,
      keywords: this.keywords.length
    });
  }
  
  /**
   * Analyze text sentiment using FinBERT
   */
  async analyzeText(text, asset = null) {
    try {
      const response = await axios.post(
        `${this.mlEndpoint}/ml/predict/sentiment`,
        { text, asset },
        { timeout: 5000 }
      );
      
      return {
        sentiment: response.data.sentiment || 'neutral',
        score: response.data.score || 0.5,
        confidence: response.data.confidence || 0.5,
        impact: this.assessImpact(text)
      };
    } catch (error) {
      // Fallback to simple keyword analysis
      logger.warn('ML sentiment failed, using keyword analysis');
      return this.keywordAnalysis(text);
    }
  }
  
  /**
   * Simple keyword-based sentiment analysis (fallback)
   */
  keywordAnalysis(text) {
    const lower = text.toLowerCase();
    
    const bullishKeywords = [
      'bullish', 'moon', 'pump', 'buy', 'long', 'adoption',
      'rate cut', 'approval', 'approved', 'etf approved',
      'partnership', 'upgrade', 'breakthrough'
    ];
    
    const bearishKeywords = [
      'bearish', 'dump', 'crash', 'sell', 'short', 'ban',
      'rate hike', 'rejection', 'rejected', 'hack', 'exploit',
      'lawsuit', 'regulation', 'investigation', 'liquidation'
    ];
    
    let bullishScore = 0;
    let bearishScore = 0;
    
    for (const kw of bullishKeywords) {
      if (lower.includes(kw)) bullishScore++;
    }
    
    for (const kw of bearishKeywords) {
      if (lower.includes(kw)) bearishScore++;
    }
    
    const total = bullishScore + bearishScore;
    if (total === 0) {
      return { sentiment: 'neutral', score: 0.5, confidence: 0.3, impact: 'low' };
    }
    
    const score = bullishScore / total;
    const sentiment = score > 0.6 ? 'bullish' : score < 0.4 ? 'bearish' : 'neutral';
    
    return {
      sentiment,
      score,
      confidence: Math.min(0.7, total * 0.1),
      impact: this.assessImpact(text)
    };
  }
  
  /**
   * Assess potential market impact of news
   */
  assessImpact(text) {
    const lower = text.toLowerCase();
    
    // High impact keywords
    const highImpact = [
      'sec', 'fed', 'federal reserve', 'rate decision',
      'etf', 'ban', 'legal', 'hack', 'exploit', 'billion',
      'ceo', 'president', 'government'
    ];
    
    // Check for high impact
    for (const kw of highImpact) {
      if (lower.includes(kw)) return 'high';
    }
    
    // Medium impact
    const mediumImpact = [
      'million', 'partnership', 'launch', 'upgrade',
      'whale', 'liquidation', 'regulation'
    ];
    
    for (const kw of mediumImpact) {
      if (lower.includes(kw)) return 'medium';
    }
    
    return 'low';
  }
  
  /**
   * Get aggregated sentiment for an asset
   */
  async getAssetSentiment(asset) {
    // Check cache
    const cacheKey = `sentiment_${asset}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    
    // In production, this would fetch from news APIs, Twitter, etc.
    // For now, return a placeholder that can be overridden
    const result = {
      asset,
      sentiment: 'neutral',
      score: 0.5,
      confidence: 0.3,
      sources: 0,
      timestamp: new Date().toISOString()
    };
    
    // Cache result
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    return result;
  }
  
  /**
   * Check for breaking news
   */
  async checkBreakingNews() {
    // In production, integrate with news APIs
    // Return empty array for now
    return [];
  }
  
  /**
   * Get Fear & Greed Index
   */
  async getFearGreedIndex() {
    try {
      const response = await axios.get(
        'https://api.alternative.me/fng/?limit=1',
        { timeout: 5000 }
      );
      
      const data = response.data.data?.[0];
      return {
        value: parseInt(data?.value || 50),
        classification: data?.value_classification || 'Neutral',
        timestamp: data?.timestamp
      };
    } catch (error) {
      logger.warn('Failed to fetch Fear & Greed Index');
      return { value: 50, classification: 'Neutral' };
    }
  }
  
  /**
   * Combined sentiment signal
   */
  async getSignal(asset) {
    const [assetSentiment, fearGreed] = await Promise.all([
      this.getAssetSentiment(asset),
      this.getFearGreedIndex()
    ]);
    
    // Combine signals
    let signal = 'neutral';
    let confidence = 0.5;
    
    // Fear & Greed extremes
    if (fearGreed.value < 20) {
      signal = 'bullish'; // Extreme fear = buying opportunity
      confidence = 0.6;
    } else if (fearGreed.value > 80) {
      signal = 'bearish'; // Extreme greed = selling opportunity
      confidence = 0.6;
    }
    
    // Override with strong asset sentiment
    if (assetSentiment.confidence > 0.7) {
      signal = assetSentiment.sentiment;
      confidence = assetSentiment.confidence;
    }
    
    return {
      asset,
      signal,
      confidence,
      fearGreed: fearGreed.value,
      assetSentiment: assetSentiment.sentiment,
      timestamp: new Date().toISOString()
    };
  }
}

export default SentimentAnalyzer;
