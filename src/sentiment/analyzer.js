/**
 * Sentiment Analyzer for LUMEN ALPHA Trading Bot
 * 
 * Analyzes crypto/stock sentiment from news, social media
 * Uses free APIs and heuristics
 */

import axios from 'axios';
import { logger } from '../utils/logger.js';

export class SentimentAnalyzer {
  constructor() {
    // Sentiment data sources
    this.apis = {
      // CryptoCompare News (free)
      cryptoCompare: 'https://min-api.cryptocompare.com/data/v2/news/',
      // Fear & Greed Index (free)
      fearGreed: 'https://api.alternative.me/fng/',
      // CoinGecko trending (free)
      coinGecko: 'https://api.coingecko.com/api/v3',
    };
    
    // Sentiment keywords for quick analysis
    this.bullishKeywords = [
      'bullish', 'moon', 'pump', 'breakout', 'rally', 'surge', 'soar',
      'buy', 'long', 'hodl', 'accumulate', 'partnership', 'adoption',
      'etf', 'approval', 'institutional', 'upgrade', 'milestone'
    ];
    
    this.bearishKeywords = [
      'bearish', 'dump', 'crash', 'plunge', 'sell', 'short', 'fear',
      'hack', 'scam', 'rug', 'ban', 'regulation', 'sec', 'lawsuit',
      'bankruptcy', 'collapse', 'warning', 'risk', 'downgrade'
    ];
    
    // Cache for sentiment data
    this.sentimentCache = new Map();
    this.cacheExpiry = 10 * 60 * 1000; // 10 minutes
    
    logger.info('Sentiment Analyzer initialized');
  }

  /**
   * Get sentiment for an asset
   */
  async getSentiment(asset) {
    const cacheKey = `sentiment_${asset}`;
    const cached = this.sentimentCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      const sentiment = await this.analyzeSentiment(asset);
      this.sentimentCache.set(cacheKey, {
        data: sentiment,
        timestamp: Date.now()
      });
      return sentiment;
    } catch (error) {
      logger.warn(`Failed to get sentiment for ${asset}`, { error: error.message });
      return this.getDefaultSentiment(asset);
    }
  }

  /**
   * Analyze sentiment from multiple sources
   */
  async analyzeSentiment(asset) {
    const results = await Promise.allSettled([
      this.getFearGreedIndex(),
      this.getCryptoNews(asset),
      this.getTrendingAnalysis(asset),
    ]);

    const fearGreed = results[0].status === 'fulfilled' ? results[0].value : null;
    const news = results[1].status === 'fulfilled' ? results[1].value : null;
    const trending = results[2].status === 'fulfilled' ? results[2].value : null;

    // Combine signals
    return this.combineSentiment(asset, { fearGreed, news, trending });
  }

  /**
   * Get Fear & Greed Index (crypto market overall)
   */
  async getFearGreedIndex() {
    try {
      const response = await axios.get(this.apis.fearGreed, { timeout: 5000 });
      const data = response.data.data[0];
      
      return {
        value: parseInt(data.value),
        classification: data.value_classification,
        timestamp: data.timestamp,
      };
    } catch (error) {
      // Simulate based on time of day (for demo)
      const hour = new Date().getHours();
      const baseValue = 50 + Math.sin(hour / 24 * Math.PI * 2) * 20;
      
      return {
        value: Math.round(baseValue + (Math.random() - 0.5) * 20),
        classification: baseValue > 60 ? 'Greed' : baseValue < 40 ? 'Fear' : 'Neutral',
        timestamp: Date.now(),
        simulated: true,
      };
    }
  }

  /**
   * Get crypto news sentiment
   */
  async getCryptoNews(asset) {
    try {
      const response = await axios.get(
        `${this.apis.cryptoCompare}?categories=${asset.toUpperCase()}&excludeCategories=Sponsored`,
        { timeout: 5000 }
      );
      
      const articles = response.data.Data || [];
      return this.analyzeNewsArticles(articles.slice(0, 10));
    } catch (error) {
      // Return simulated news sentiment
      return this.simulateNewsSentiment(asset);
    }
  }

  /**
   * Analyze news articles for sentiment
   */
  analyzeNewsArticles(articles) {
    if (articles.length === 0) {
      return { score: 0, articles: 0, signal: 'neutral' };
    }

    let bullishCount = 0;
    let bearishCount = 0;

    for (const article of articles) {
      const text = `${article.title} ${article.body}`.toLowerCase();
      
      for (const keyword of this.bullishKeywords) {
        if (text.includes(keyword)) {
          bullishCount++;
          break;
        }
      }
      
      for (const keyword of this.bearishKeywords) {
        if (text.includes(keyword)) {
          bearishCount++;
          break;
        }
      }
    }

    const score = (bullishCount - bearishCount) / articles.length;
    
    return {
      score,
      articles: articles.length,
      bullish: bullishCount,
      bearish: bearishCount,
      signal: score > 0.2 ? 'bullish' : score < -0.2 ? 'bearish' : 'neutral',
    };
  }

  /**
   * Simulate news sentiment for demo
   */
  simulateNewsSentiment(asset) {
    const baseScore = (Math.random() - 0.5) * 0.6; // -0.3 to 0.3
    
    return {
      score: baseScore,
      articles: 5,
      bullish: baseScore > 0 ? 3 : 1,
      bearish: baseScore < 0 ? 3 : 1,
      signal: baseScore > 0.2 ? 'bullish' : baseScore < -0.2 ? 'bearish' : 'neutral',
      simulated: true,
    };
  }

  /**
   * Get trending analysis from CoinGecko
   */
  async getTrendingAnalysis(asset) {
    try {
      const response = await axios.get(
        `${this.apis.coinGecko}/search/trending`,
        { timeout: 5000 }
      );
      
      const trending = response.data.coins || [];
      const isTrending = trending.some(
        c => c.item.symbol.toUpperCase() === asset.toUpperCase()
      );
      
      return {
        isTrending,
        trendingRank: isTrending ? 
          trending.findIndex(c => c.item.symbol.toUpperCase() === asset.toUpperCase()) + 1 : 
          null,
        signal: isTrending ? 'bullish' : 'neutral',
      };
    } catch (error) {
      return { isTrending: false, signal: 'neutral', simulated: true };
    }
  }

  /**
   * Combine all sentiment signals
   */
  combineSentiment(asset, { fearGreed, news, trending }) {
    let totalScore = 0;
    let weights = 0;

    // Fear & Greed (weight: 0.3)
    if (fearGreed) {
      const fgScore = (fearGreed.value - 50) / 50; // -1 to 1
      totalScore += fgScore * 0.3;
      weights += 0.3;
    }

    // News sentiment (weight: 0.5)
    if (news) {
      totalScore += news.score * 0.5;
      weights += 0.5;
    }

    // Trending (weight: 0.2)
    if (trending) {
      totalScore += (trending.isTrending ? 0.3 : 0) * 0.2;
      weights += 0.2;
    }

    // Normalize
    const finalScore = weights > 0 ? totalScore / weights : 0;
    const confidence = 0.50 + Math.abs(finalScore) * 0.30; // 0.50 - 0.80

    return {
      asset,
      score: finalScore,
      confidence: Math.min(confidence, 0.80),
      signal: finalScore > 0.15 ? 'bullish' : finalScore < -0.15 ? 'bearish' : 'neutral',
      components: {
        fearGreed: fearGreed?.value,
        newsScore: news?.score,
        isTrending: trending?.isTrending,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get default sentiment when all sources fail
   */
  getDefaultSentiment(asset) {
    return {
      asset,
      score: 0,
      confidence: 0.50,
      signal: 'neutral',
      components: {},
      timestamp: new Date().toISOString(),
      default: true,
    };
  }

  /**
   * Get trading signal from sentiment
   */
  async getSignal(asset) {
    const sentiment = await this.getSentiment(asset);
    
    return {
      asset,
      signal: sentiment.signal,
      confidence: sentiment.confidence,
      sentimentScore: sentiment.score,
      source: 'sentiment_analyzer',
    };
  }
}
