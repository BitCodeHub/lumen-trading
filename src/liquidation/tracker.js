// Liquidation Tracker - Stub implementation
// TODO: Implement full liquidation tracking

export class LiquidationTracker {
  constructor() {
    this.recentLiquidations = [];
  }

  async getLiquidations(symbol = null) {
    // Stub: return empty array until fully implemented
    return [];
  }

  async getRecentLiquidations(symbol, minutes = 60) {
    return [];
  }

  async getLiquidationVolume(symbol) {
    return { long: 0, short: 0, total: 0 };
  }
}

export default LiquidationTracker;
