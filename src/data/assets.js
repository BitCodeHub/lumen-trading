/**
 * Asset Configuration for LUMEN ALPHA
 * Top 50 Crypto + Key Stocks
 */

// Top 50 Crypto by market cap
export const TOP_CRYPTO = [
  'BTC', 'ETH', 'XRP', 'SOL', 'BNB', 'DOGE', 'ADA', 'TRX', 'AVAX', 'LINK',
  'TON', 'SHIB', 'XLM', 'DOT', 'HBAR', 'BCH', 'LEO', 'UNI', 'LTC', 'NEAR',
  'APT', 'PEPE', 'ICP', 'DAI', 'ETC', 'RNDR', 'FET', 'CRO', 'STX', 'MNT',
  'ATOM', 'IMX', 'TAO', 'FIL', 'KAS', 'XMR', 'ARB', 'SUI', 'VET', 'OP',
  'WIF', 'INJ', 'THETA', 'AAVE', 'GRT', 'MATIC', 'FTM', 'ALGO', 'RUNE', 'JUP'
];

// Crypto-related stocks
export const CRYPTO_STOCKS = [
  'COIN', 'MARA', 'RIOT', 'MSTR', 'CLSK', 'HUT', 'BITF'
];

// Tech stocks (for diversification)
export const TECH_STOCKS = [
  'AAPL', 'TSLA', 'NVDA', 'GOOGL', 'AMZN', 'META', 'MSFT', 'AMD', 'PLTR'
];

// All tradeable assets
export const ALL_ASSETS = [...TOP_CRYPTO, ...CRYPTO_STOCKS, ...TECH_STOCKS];

// Binance symbol mapping
export const BINANCE_SYMBOLS = Object.fromEntries(
  TOP_CRYPTO.map(symbol => [symbol, `${symbol}USDT`])
);

// CoinGecko ID mapping (for prices)
export const COINGECKO_IDS = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'XRP': 'ripple', 'SOL': 'solana',
  'BNB': 'binancecoin', 'DOGE': 'dogecoin', 'ADA': 'cardano', 'TRX': 'tron',
  'AVAX': 'avalanche-2', 'LINK': 'chainlink', 'TON': 'the-open-network',
  'SHIB': 'shiba-inu', 'XLM': 'stellar', 'DOT': 'polkadot', 'HBAR': 'hedera-hashgraph',
  'BCH': 'bitcoin-cash', 'LEO': 'leo-token', 'UNI': 'uniswap', 'LTC': 'litecoin',
  'NEAR': 'near', 'APT': 'aptos', 'PEPE': 'pepe', 'ICP': 'internet-computer',
  'DAI': 'dai', 'ETC': 'ethereum-classic', 'RNDR': 'render-token', 'FET': 'fetch-ai',
  'CRO': 'crypto-com-chain', 'STX': 'stacks', 'MNT': 'mantle', 'ATOM': 'cosmos',
  'IMX': 'immutable-x', 'TAO': 'bittensor', 'FIL': 'filecoin', 'KAS': 'kaspa',
  'XMR': 'monero', 'ARB': 'arbitrum', 'SUI': 'sui', 'VET': 'vechain',
  'OP': 'optimism', 'WIF': 'dogwifcoin', 'INJ': 'injective-protocol',
  'THETA': 'theta-token', 'AAVE': 'aave', 'GRT': 'the-graph', 'MATIC': 'matic-network',
  'FTM': 'fantom', 'ALGO': 'algorand', 'RUNE': 'thorchain', 'JUP': 'jupiter-exchange-solana'
};

export default { TOP_CRYPTO, CRYPTO_STOCKS, TECH_STOCKS, ALL_ASSETS, BINANCE_SYMBOLS, COINGECKO_IDS };
