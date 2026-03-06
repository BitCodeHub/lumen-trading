#!/usr/bin/env node
/**
 * Historical Data Downloader for LUMEN ALPHA
 * Downloads 4 years of OHLCV data for backtesting
 * Runs autonomously on Mac Studio
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical');
const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'TRX', 'SHIB'];
const INTERVAL = '1h'; // 1-hour candles
const START_DATE = new Date('2022-01-01');
const END_DATE = new Date();

// KuCoin API (no geo-restrictions)
const KUCOIN_BASE = 'https://api.kucoin.com';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${msg}`);
}

async function fetchKuCoin(symbol, startAt, endAt) {
  return new Promise((resolve, reject) => {
    const url = `${KUCOIN_BASE}/api/v1/market/candles?type=${INTERVAL}&symbol=${symbol}-USDT&startAt=${startAt}&endAt=${endAt}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === '200000' && json.data) {
            resolve(json.data);
          } else {
            resolve([]);
          }
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

async function downloadAsset(symbol) {
  log(`Downloading ${symbol}...`);
  
  const allCandles = [];
  let currentStart = Math.floor(START_DATE.getTime() / 1000);
  const endTimestamp = Math.floor(END_DATE.getTime() / 1000);
  
  // KuCoin returns max 1500 candles per request
  // 1h candles = ~62 days per request
  const chunkSize = 1500 * 3600; // seconds
  
  while (currentStart < endTimestamp) {
    const chunkEnd = Math.min(currentStart + chunkSize, endTimestamp);
    
    const candles = await fetchKuCoin(symbol, currentStart, chunkEnd);
    
    if (candles.length > 0) {
      // KuCoin format: [time, open, close, high, low, volume, turnover]
      const formatted = candles.map(c => ({
        timestamp: parseInt(c[0]) * 1000,
        open: parseFloat(c[1]),
        close: parseFloat(c[2]),
        high: parseFloat(c[3]),
        low: parseFloat(c[4]),
        volume: parseFloat(c[5])
      }));
      allCandles.push(...formatted);
    }
    
    currentStart = chunkEnd;
    await sleep(200); // Rate limiting
  }
  
  // Sort by timestamp and remove duplicates
  const uniqueCandles = [...new Map(allCandles.map(c => [c.timestamp, c])).values()];
  uniqueCandles.sort((a, b) => a.timestamp - b.timestamp);
  
  // Save to file
  const filepath = path.join(DATA_DIR, `${symbol}_${INTERVAL}.json`);
  fs.writeFileSync(filepath, JSON.stringify(uniqueCandles, null, 2));
  
  log(`✅ ${symbol}: ${uniqueCandles.length} candles saved`);
  return uniqueCandles.length;
}

async function main() {
  log('='.repeat(60));
  log('LUMEN ALPHA - Historical Data Downloader');
  log(`Period: ${START_DATE.toISOString().slice(0,10)} to ${END_DATE.toISOString().slice(0,10)}`);
  log(`Assets: ${ASSETS.length}`);
  log(`Interval: ${INTERVAL}`);
  log('='.repeat(60));
  
  // Ensure directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  let totalCandles = 0;
  
  for (const asset of ASSETS) {
    try {
      const count = await downloadAsset(asset);
      totalCandles += count;
      await sleep(500); // Pause between assets
    } catch (err) {
      log(`❌ ${asset}: ${err.message}`);
    }
  }
  
  log('='.repeat(60));
  log(`COMPLETE: ${totalCandles.toLocaleString()} total candles`);
  log(`Data saved to: ${DATA_DIR}`);
  log('='.repeat(60));
  
  // Save metadata
  const metadata = {
    downloadedAt: new Date().toISOString(),
    startDate: START_DATE.toISOString(),
    endDate: END_DATE.toISOString(),
    interval: INTERVAL,
    assets: ASSETS,
    totalCandles
  };
  fs.writeFileSync(path.join(DATA_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2));
}

main().catch(console.error);
