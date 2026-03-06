#!/usr/bin/env node
/**
 * LUMEN ALPHA Backtesting Engine
 * Tests strategies against historical data
 * Calculates Sharpe ratio, max drawdown, win rate
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical');
const RESULTS_DIR = path.join(__dirname, '..', 'data', 'backtest-results');

// Trading parameters
const INITIAL_CAPITAL = 10000;
const POSITION_SIZE = 0.02; // 2% per trade
const COMMISSION = 0.001; // 0.1% per trade
const SLIPPAGE = 0.0005; // 0.05%

function log(msg) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${msg}`);
}

// ============================================
// STRATEGIES
// ============================================

const strategies = {
  // Strategy 1: RSI(2) Mean Reversion
  rsi2: {
    name: 'RSI(2) Mean Reversion',
    params: { period: 2, oversold: 10, overbought: 90 },
    signal: (candles, i, params) => {
      if (i < params.period + 1) return 0;
      
      // Calculate RSI(2)
      let gains = 0, losses = 0;
      for (let j = i - params.period; j < i; j++) {
        const change = candles[j].close - candles[j - 1].close;
        if (change > 0) gains += change;
        else losses -= change;
      }
      const rs = gains / (losses || 0.0001);
      const rsi = 100 - (100 / (1 + rs));
      
      if (rsi < params.oversold) return 1; // Buy
      if (rsi > params.overbought) return -1; // Sell
      return 0;
    }
  },
  
  // Strategy 2: Bollinger Bands Mean Reversion
  bollinger: {
    name: 'Bollinger Mean Reversion',
    params: { period: 20, stdDev: 2 },
    signal: (candles, i, params) => {
      if (i < params.period) return 0;
      
      // Calculate SMA and StdDev
      let sum = 0;
      for (let j = i - params.period; j < i; j++) {
        sum += candles[j].close;
      }
      const sma = sum / params.period;
      
      let variance = 0;
      for (let j = i - params.period; j < i; j++) {
        variance += Math.pow(candles[j].close - sma, 2);
      }
      const stdDev = Math.sqrt(variance / params.period);
      
      const upperBand = sma + (params.stdDev * stdDev);
      const lowerBand = sma - (params.stdDev * stdDev);
      const price = candles[i].close;
      
      if (price < lowerBand) return 1; // Buy
      if (price > upperBand) return -1; // Sell
      return 0;
    }
  },
  
  // Strategy 3: Momentum Breakout
  momentum: {
    name: 'Momentum Breakout',
    params: { period: 20 },
    signal: (candles, i, params) => {
      if (i < params.period) return 0;
      
      // Find highest high and lowest low
      let highestHigh = 0, lowestLow = Infinity;
      for (let j = i - params.period; j < i; j++) {
        highestHigh = Math.max(highestHigh, candles[j].high);
        lowestLow = Math.min(lowestLow, candles[j].low);
      }
      
      const price = candles[i].close;
      if (price > highestHigh) return 1; // Breakout up
      if (price < lowestLow) return -1; // Breakout down
      return 0;
    }
  },
  
  // Strategy 4: Triple RSI
  tripleRSI: {
    name: 'Triple RSI',
    params: { periods: [7, 14, 21], threshold: 30 },
    signal: (candles, i, params) => {
      if (i < Math.max(...params.periods) + 1) return 0;
      
      const rsiValues = params.periods.map(period => {
        let gains = 0, losses = 0;
        for (let j = i - period; j < i; j++) {
          const change = candles[j].close - candles[j - 1].close;
          if (change > 0) gains += change;
          else losses -= change;
        }
        const rs = gains / (losses || 0.0001);
        return 100 - (100 / (1 + rs));
      });
      
      const avgRSI = rsiValues.reduce((a, b) => a + b, 0) / rsiValues.length;
      
      if (avgRSI < params.threshold) return 1; // Oversold
      if (avgRSI > 100 - params.threshold) return -1; // Overbought
      return 0;
    }
  },
  
  // Strategy 5: MACD Crossover
  macd: {
    name: 'MACD Crossover',
    params: { fast: 12, slow: 26, signal: 9 },
    signal: (candles, i, params) => {
      if (i < params.slow + params.signal) return 0;
      
      // Calculate EMAs
      const calcEMA = (period, endIdx) => {
        const k = 2 / (period + 1);
        let ema = candles[endIdx - period].close;
        for (let j = endIdx - period + 1; j <= endIdx; j++) {
          ema = candles[j].close * k + ema * (1 - k);
        }
        return ema;
      };
      
      const fastEMA = calcEMA(params.fast, i);
      const slowEMA = calcEMA(params.slow, i);
      const macdLine = fastEMA - slowEMA;
      
      const prevFastEMA = calcEMA(params.fast, i - 1);
      const prevSlowEMA = calcEMA(params.slow, i - 1);
      const prevMacdLine = prevFastEMA - prevSlowEMA;
      
      if (macdLine > 0 && prevMacdLine <= 0) return 1; // Bullish crossover
      if (macdLine < 0 && prevMacdLine >= 0) return -1; // Bearish crossover
      return 0;
    }
  }
};

// ============================================
// BACKTESTING ENGINE
// ============================================

function backtest(candles, strategy) {
  let capital = INITIAL_CAPITAL;
  let position = 0; // 1 = long, -1 = short, 0 = flat
  let entryPrice = 0;
  let trades = [];
  let equity = [INITIAL_CAPITAL];
  let peakEquity = INITIAL_CAPITAL;
  let maxDrawdown = 0;
  
  for (let i = 1; i < candles.length; i++) {
    const signal = strategy.signal(candles, i, strategy.params);
    const price = candles[i].close;
    
    // Close existing position if opposite signal
    if (position !== 0 && signal !== 0 && signal !== position) {
      const exitPrice = price * (1 - SLIPPAGE * (position > 0 ? -1 : 1));
      const pnlPercent = position > 0 
        ? (exitPrice - entryPrice) / entryPrice
        : (entryPrice - exitPrice) / entryPrice;
      const pnl = capital * POSITION_SIZE * pnlPercent - (capital * POSITION_SIZE * COMMISSION * 2);
      
      trades.push({
        type: position > 0 ? 'LONG' : 'SHORT',
        entry: entryPrice,
        exit: exitPrice,
        pnl: pnl,
        pnlPercent: pnlPercent * 100,
        timestamp: candles[i].timestamp
      });
      
      capital += pnl;
      position = 0;
    }
    
    // Open new position
    if (position === 0 && signal !== 0) {
      position = signal;
      entryPrice = price * (1 + SLIPPAGE * signal);
    }
    
    // Track equity and drawdown
    equity.push(capital);
    if (capital > peakEquity) peakEquity = capital;
    const drawdown = (peakEquity - capital) / peakEquity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  // Close any open position at end
  if (position !== 0) {
    const exitPrice = candles[candles.length - 1].close;
    const pnlPercent = position > 0 
      ? (exitPrice - entryPrice) / entryPrice
      : (entryPrice - exitPrice) / entryPrice;
    const pnl = capital * POSITION_SIZE * pnlPercent;
    capital += pnl;
    
    trades.push({
      type: position > 0 ? 'LONG' : 'SHORT',
      entry: entryPrice,
      exit: exitPrice,
      pnl: pnl,
      pnlPercent: pnlPercent * 100,
      timestamp: candles[candles.length - 1].timestamp
    });
  }
  
  // Calculate metrics
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);
  const totalReturn = (capital - INITIAL_CAPITAL) / INITIAL_CAPITAL;
  const avgReturn = trades.length > 0 ? trades.reduce((a, t) => a + t.pnlPercent, 0) / trades.length : 0;
  const stdDev = Math.sqrt(trades.reduce((a, t) => a + Math.pow(t.pnlPercent - avgReturn, 2), 0) / (trades.length || 1));
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
  
  return {
    strategy: strategy.name,
    trades: trades.length,
    wins: winningTrades.length,
    losses: losingTrades.length,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length * 100).toFixed(1) : 0,
    totalReturn: (totalReturn * 100).toFixed(2),
    maxDrawdown: (maxDrawdown * 100).toFixed(2),
    sharpeRatio: sharpeRatio.toFixed(2),
    finalCapital: capital.toFixed(2),
    avgWin: winningTrades.length > 0 ? (winningTrades.reduce((a, t) => a + t.pnlPercent, 0) / winningTrades.length).toFixed(2) : 0,
    avgLoss: losingTrades.length > 0 ? (losingTrades.reduce((a, t) => a + t.pnlPercent, 0) / losingTrades.length).toFixed(2) : 0
  };
}

async function main() {
  log('='.repeat(70));
  log('LUMEN ALPHA - Backtesting Engine');
  log('='.repeat(70));
  
  // Ensure results directory exists
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
  
  // Load available data files
  const dataFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('_1h.json'));
  
  if (dataFiles.length === 0) {
    log('❌ No historical data found. Run download-historical.cjs first.');
    return;
  }
  
  log(`Found ${dataFiles.length} assets with historical data`);
  
  const allResults = [];
  
  for (const file of dataFiles) {
    const asset = file.replace('_1h.json', '');
    const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file)));
    
    log(`\n📊 ${asset} (${candles.length} candles)`);
    
    for (const [key, strategy] of Object.entries(strategies)) {
      const result = backtest(candles, strategy);
      result.asset = asset;
      allResults.push(result);
      
      const status = parseFloat(result.sharpeRatio) > 1.5 ? '✅' : 
                     parseFloat(result.sharpeRatio) > 0.5 ? '⚠️' : '❌';
      
      log(`  ${status} ${strategy.name}: Sharpe=${result.sharpeRatio}, WinRate=${result.winRate}%, Return=${result.totalReturn}%, MaxDD=${result.maxDrawdown}%`);
    }
  }
  
  // Save results
  const resultsPath = path.join(RESULTS_DIR, `backtest_${Date.now()}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2));
  
  // Generate summary
  log('\n' + '='.repeat(70));
  log('SUMMARY - Strategies Meeting Criteria (Sharpe > 1.5)');
  log('='.repeat(70));
  
  const passing = allResults.filter(r => parseFloat(r.sharpeRatio) > 1.5);
  if (passing.length === 0) {
    log('❌ No strategies met the minimum Sharpe ratio of 1.5');
  } else {
    passing.sort((a, b) => parseFloat(b.sharpeRatio) - parseFloat(a.sharpeRatio));
    for (const r of passing.slice(0, 10)) {
      log(`✅ ${r.asset} | ${r.strategy} | Sharpe: ${r.sharpeRatio} | Return: ${r.totalReturn}% | MaxDD: ${r.maxDrawdown}%`);
    }
  }
  
  log('\n' + '='.repeat(70));
  log(`Results saved to: ${resultsPath}`);
  log('='.repeat(70));
}

main().catch(console.error);
