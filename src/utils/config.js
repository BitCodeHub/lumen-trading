/**
 * Configuration for LUMEN ALPHA Trading Bot
 * Risk limits are HARDCODED and cannot be overridden
 */

import dotenv from 'dotenv';
dotenv.config();

// HARDCODED RISK LIMITS - DO NOT MODIFY
const RISK_LIMITS = {
  maxPositionSize: 0.02,        // 2% of equity per trade
  maxLeverage: 3,               // 3x max leverage
  maxOpenPositions: 5,          // Max concurrent positions
  dailyLossLimit: 0.03,         // Stop at 3% daily loss
  weeklyLossLimit: 0.08,        // Stop at 8% weekly loss
  circuitBreaker: 0.05,         // Halt ALL trading at 5% drawdown
  requireApproval: 500,         // Human approval for trades > $500
  autoBenchAfterLosses: 3,      // Bench strategy after 3 consecutive losses
  benchDuration: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  cooldownAfterBreaker: 4 * 60 * 60 * 1000 // 4 hours in ms
};

// Freeze risk limits - cannot be modified at runtime
Object.freeze(RISK_LIMITS);

export const config = {
  // Server
  port: process.env.PORT || 8080,
  webhookSecret: process.env.WEBHOOK_SECRET || 'change-me-in-production',
  
  // Trading mode
  tradingMode: process.env.TRADING_MODE || 'paper', // 'paper' or 'live'
  
  // Capital
  initialCapital: parseFloat(process.env.INITIAL_CAPITAL) || 1000,
  
  // Risk (hardcoded, frozen)
  risk: RISK_LIMITS,
  
  // ML Service (Elim's DGX Spark)
  ml: {
    endpoint: process.env.ML_ENDPOINT || 'http://100.79.93.27:5000',
    timeout: 5000 // 5 second timeout for ML calls
  },
  
  // Exchanges
  exchanges: {
    hyperliquid: {
      apiKey: process.env.HYPERLIQUID_API_KEY,
      apiSecret: process.env.HYPERLIQUID_API_SECRET,
      testnet: process.env.HYPERLIQUID_TESTNET === 'true'
    },
    bybit: {
      apiKey: process.env.BYBIT_API_KEY,
      apiSecret: process.env.BYBIT_API_SECRET,
      testnet: process.env.BYBIT_TESTNET === 'true'
    }
  },
  
  // Notifications
  notifications: {
    whatsappEnabled: process.env.WHATSAPP_ENABLED !== 'false',
    target: process.env.WHATSAPP_TARGET || '+19495422279'
  },
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
};

export default config;
