#!/usr/bin/env node
/**
 * LUMEN ALPHA - ML Signal Generator
 * Uses gradient boosting for signal prediction
 * Features: technical indicators, volume, momentum
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical');
const MODELS_DIR = path.join(__dirname, '..', 'data', 'models');
const RESULTS_DIR = path.join(__dirname, '..', 'data', 'ml-results');

// Simple gradient boosting implementation
class GradientBoostingClassifier {
  constructor(nEstimators = 50, maxDepth = 3, learningRate = 0.1) {
    this.nEstimators = nEstimators;
    this.maxDepth = maxDepth;
    this.learningRate = learningRate;
    this.trees = [];
  }

  // Decision stump (simple tree)
  buildTree(X, residuals, depth = 0) {
    if (depth >= this.maxDepth || X.length < 10) {
      return { value: this.mean(residuals) };
    }

    let bestSplit = { gain: -Infinity };
    
    for (let featureIdx = 0; featureIdx < X[0].length; featureIdx++) {
      const values = X.map((x, i) => ({ val: x[featureIdx], res: residuals[i] }));
      values.sort((a, b) => a.val - b.val);
      
      for (let i = 10; i < values.length - 10; i += Math.max(1, Math.floor(values.length / 20))) {
        const threshold = values[i].val;
        const leftRes = values.slice(0, i).map(v => v.res);
        const rightRes = values.slice(i).map(v => v.res);
        
        const gain = this.variance(residuals) - 
          (leftRes.length / residuals.length) * this.variance(leftRes) -
          (rightRes.length / residuals.length) * this.variance(rightRes);
        
        if (gain > bestSplit.gain) {
          bestSplit = { gain, featureIdx, threshold, leftIdx: i };
        }
      }
    }

    if (bestSplit.gain <= 0) {
      return { value: this.mean(residuals) };
    }

    const leftIndices = [];
    const rightIndices = [];
    X.forEach((x, i) => {
      if (x[bestSplit.featureIdx] <= bestSplit.threshold) {
        leftIndices.push(i);
      } else {
        rightIndices.push(i);
      }
    });

    return {
      featureIdx: bestSplit.featureIdx,
      threshold: bestSplit.threshold,
      left: this.buildTree(
        leftIndices.map(i => X[i]),
        leftIndices.map(i => residuals[i]),
        depth + 1
      ),
      right: this.buildTree(
        rightIndices.map(i => X[i]),
        rightIndices.map(i => residuals[i]),
        depth + 1
      )
    };
  }

  predict_tree(tree, x) {
    if (tree.value !== undefined) return tree.value;
    if (x[tree.featureIdx] <= tree.threshold) {
      return this.predict_tree(tree.left, x);
    }
    return this.predict_tree(tree.right, x);
  }

  mean(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  variance(arr) {
    if (arr.length < 2) return 0;
    const m = this.mean(arr);
    return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  }

  fit(X, y) {
    let predictions = new Array(y.length).fill(this.mean(y));
    
    for (let i = 0; i < this.nEstimators; i++) {
      const residuals = y.map((yi, idx) => yi - predictions[idx]);
      const tree = this.buildTree(X, residuals);
      this.trees.push(tree);
      
      predictions = predictions.map((p, idx) => 
        p + this.learningRate * this.predict_tree(tree, X[idx])
      );
    }
  }

  predict(X) {
    return X.map(x => {
      let pred = 0;
      for (const tree of this.trees) {
        pred += this.learningRate * this.predict_tree(tree, x);
      }
      return pred > 0 ? 1 : -1;
    });
  }
}

// Feature engineering
function extractFeatures(candles, i) {
  if (i < 50) return null;
  
  const closes = candles.slice(i - 50, i).map(c => c.close);
  const highs = candles.slice(i - 50, i).map(c => c.high);
  const lows = candles.slice(i - 50, i).map(c => c.low);
  const volumes = candles.slice(i - 50, i).map(c => c.volume);
  
  // RSI (14)
  let gains = 0, losses = 0;
  for (let j = closes.length - 14; j < closes.length; j++) {
    const change = closes[j] - closes[j - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const rsi14 = 100 - (100 / (1 + gains / (losses || 0.0001)));
  
  // RSI (7)
  gains = 0; losses = 0;
  for (let j = closes.length - 7; j < closes.length; j++) {
    const change = closes[j] - closes[j - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const rsi7 = 100 - (100 / (1 + gains / (losses || 0.0001)));
  
  // Moving averages
  const sma10 = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.reduce((a, b) => a + b, 0) / 50;
  
  const currentPrice = closes[closes.length - 1];
  
  // Bollinger Bands
  const std20 = Math.sqrt(closes.slice(-20).reduce((a, b) => a + (b - sma20) ** 2, 0) / 20);
  const bbUpper = sma20 + 2 * std20;
  const bbLower = sma20 - 2 * std20;
  const bbPosition = (currentPrice - bbLower) / (bbUpper - bbLower || 1);
  
  // MACD
  const ema12 = this.calcEMA(closes, 12);
  const ema26 = this.calcEMA(closes, 26);
  const macd = ema12 - ema26;
  
  // Volume features
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const volumeRatio = volumes[volumes.length - 1] / (avgVolume || 1);
  
  // Price momentum
  const returns1h = (currentPrice - closes[closes.length - 2]) / closes[closes.length - 2];
  const returns4h = (currentPrice - closes[closes.length - 5]) / closes[closes.length - 5];
  const returns24h = (currentPrice - closes[closes.length - 25]) / closes[closes.length - 25];
  
  // ATR (14)
  let atrSum = 0;
  for (let j = highs.length - 14; j < highs.length; j++) {
    const tr = Math.max(
      highs[j] - lows[j],
      Math.abs(highs[j] - closes[j - 1]),
      Math.abs(lows[j] - closes[j - 1])
    );
    atrSum += tr;
  }
  const atr = atrSum / 14;
  const atrPercent = atr / currentPrice;
  
  return [
    rsi14 / 100,
    rsi7 / 100,
    (currentPrice - sma10) / sma10,
    (currentPrice - sma20) / sma20,
    (currentPrice - sma50) / sma50,
    bbPosition,
    macd / currentPrice,
    volumeRatio,
    returns1h,
    returns4h,
    returns24h,
    atrPercent
  ];
}

// Helper for EMA
function calcEMA(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

// Add to global scope
global.calcEMA = calcEMA;
extractFeatures.prototype = { calcEMA };

function prepareData(candles, lookforward = 24) {
  const X = [];
  const y = [];
  
  for (let i = 50; i < candles.length - lookforward; i++) {
    const features = extractFeatures.call({ calcEMA }, candles, i);
    if (!features || features.some(f => isNaN(f) || !isFinite(f))) continue;
    
    // Label: 1 if price goes up by 1%+ in next 24h, -1 if down 1%+, 0 otherwise
    const futureReturn = (candles[i + lookforward].close - candles[i].close) / candles[i].close;
    const label = futureReturn > 0.01 ? 1 : futureReturn < -0.01 ? -1 : 0;
    
    if (label !== 0) {
      X.push(features);
      y.push(label);
    }
  }
  
  return { X, y };
}

function backtest(candles, model, startIdx) {
  let capital = 10000;
  let position = 0;
  let entryPrice = 0;
  let trades = [];
  let peakCapital = capital;
  let maxDrawdown = 0;
  
  for (let i = startIdx; i < candles.length - 1; i++) {
    const features = extractFeatures.call({ calcEMA }, candles, i);
    if (!features || features.some(f => isNaN(f) || !isFinite(f))) continue;
    
    const signal = model.predict([features])[0];
    const price = candles[i].close;
    
    // Close position on opposite signal
    if (position !== 0 && signal !== position) {
      const pnl = position > 0 
        ? (price - entryPrice) / entryPrice 
        : (entryPrice - price) / entryPrice;
      
      trades.push({
        type: position > 0 ? 'LONG' : 'SHORT',
        entry: entryPrice,
        exit: price,
        pnl: pnl * 100
      });
      
      capital *= (1 + pnl * 0.02); // 2% position size
      position = 0;
    }
    
    // Open new position
    if (position === 0 && signal !== 0) {
      position = signal;
      entryPrice = price;
    }
    
    // Track drawdown
    if (capital > peakCapital) peakCapital = capital;
    const dd = (peakCapital - capital) / peakCapital;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  
  const wins = trades.filter(t => t.pnl > 0).length;
  const totalReturn = (capital - 10000) / 10000 * 100;
  const avgPnl = trades.length > 0 ? trades.reduce((a, t) => a + t.pnl, 0) / trades.length : 0;
  const stdPnl = trades.length > 1 
    ? Math.sqrt(trades.reduce((a, t) => a + (t.pnl - avgPnl) ** 2, 0) / trades.length) 
    : 1;
  const sharpe = stdPnl > 0 ? (avgPnl / stdPnl) * Math.sqrt(252) : 0;
  
  return {
    trades: trades.length,
    wins,
    winRate: trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : 0,
    totalReturn: totalReturn.toFixed(2),
    maxDrawdown: (maxDrawdown * 100).toFixed(2),
    sharpe: sharpe.toFixed(2),
    finalCapital: capital.toFixed(2)
  };
}

function log(msg) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${msg}`);
}

async function main() {
  log('='.repeat(70));
  log('LUMEN ALPHA - ML Signal Generator');
  log('='.repeat(70));
  
  // Ensure directories exist
  [MODELS_DIR, RESULTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  
  const dataFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('_1h.json'));
  const allResults = [];
  
  for (const file of dataFiles) {
    const asset = file.replace('_1h.json', '');
    const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file)));
    
    if (candles.length < 1000) {
      log(`⏭️ ${asset}: Not enough data (${candles.length} candles)`);
      continue;
    }
    
    log(`\n📊 ${asset} (${candles.length} candles)`);
    
    // Split: 70% train, 30% test
    const splitIdx = Math.floor(candles.length * 0.7);
    const trainCandles = candles.slice(0, splitIdx);
    const testCandles = candles;
    
    // Prepare training data
    const { X, y } = prepareData(trainCandles);
    
    if (X.length < 100) {
      log(`   ⏭️ Not enough training samples (${X.length})`);
      continue;
    }
    
    log(`   Training on ${X.length} samples...`);
    
    // Train model
    const model = new GradientBoostingClassifier(100, 4, 0.05);
    model.fit(X, y);
    
    // Backtest on test set
    const result = backtest(testCandles, model, splitIdx);
    result.asset = asset;
    result.trainSamples = X.length;
    
    allResults.push(result);
    
    const status = parseFloat(result.sharpe) > 1.5 ? '✅' : 
                   parseFloat(result.sharpe) > 0.5 ? '⚠️' : '❌';
    
    log(`   ${status} Sharpe=${result.sharpe}, WinRate=${result.winRate}%, Return=${result.totalReturn}%, MaxDD=${result.maxDrawdown}%`);
    
    // Save model
    fs.writeFileSync(
      path.join(MODELS_DIR, `${asset}_gb.json`),
      JSON.stringify({ trees: model.trees, learningRate: model.learningRate })
    );
  }
  
  // Summary
  log('\n' + '='.repeat(70));
  log('ML RESULTS SUMMARY');
  log('='.repeat(70));
  
  const passing = allResults.filter(r => parseFloat(r.sharpe) > 1.5);
  const promising = allResults.filter(r => parseFloat(r.sharpe) > 0.5 && parseFloat(r.sharpe) <= 1.5);
  
  if (passing.length > 0) {
    log(`\n✅ PASSING (Sharpe > 1.5): ${passing.length}`);
    passing.sort((a, b) => parseFloat(b.sharpe) - parseFloat(a.sharpe));
    for (const r of passing) {
      log(`   ${r.asset}: Sharpe=${r.sharpe}, Return=${r.totalReturn}%, WinRate=${r.winRate}%`);
    }
  }
  
  if (promising.length > 0) {
    log(`\n⚠️ PROMISING (Sharpe 0.5-1.5): ${promising.length}`);
    promising.sort((a, b) => parseFloat(b.sharpe) - parseFloat(a.sharpe));
    for (const r of promising) {
      log(`   ${r.asset}: Sharpe=${r.sharpe}, Return=${r.totalReturn}%, WinRate=${r.winRate}%`);
    }
  }
  
  // Save results
  const resultsPath = path.join(RESULTS_DIR, `ml_results_${Date.now()}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2));
  
  log('\n' + '='.repeat(70));
  log(`Results saved to: ${resultsPath}`);
  log('='.repeat(70));
}

main().catch(console.error);
