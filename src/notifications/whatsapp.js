/**
 * WhatsApp Notifier for LUMEN ALPHA Trading Bot
 * 
 * Sends trade alerts and notifications to WhatsApp
 */

import { logger } from '../utils/logger.js';

export class WhatsAppNotifier {
  constructor() {
    this.enabled = process.env.WHATSAPP_ENABLED !== 'false';
    this.target = process.env.WHATSAPP_TARGET || '+19495422279';
    
    logger.info('WhatsApp Notifier initialized', { enabled: this.enabled });
  }
  
  /**
   * Send a notification
   */
  async send(message) {
    if (!this.enabled) {
      logger.debug('WhatsApp disabled, message logged:', { message });
      return { status: 'disabled' };
    }
    
    try {
      // For now, just log the message
      // In production, this would integrate with OpenClaw messaging
      logger.info('WhatsApp notification', { message, target: this.target });
      
      // TODO: Integrate with OpenClaw message tool
      // await openalaw.message.send({ target: this.target, message });
      
      return { status: 'sent', message };
    } catch (error) {
      logger.error('WhatsApp send failed', { error: error.message });
      return { status: 'error', error: error.message };
    }
  }
  
  /**
   * Send trade alert with action buttons
   */
  async sendTradeAlert(trade) {
    const message = `
📊 *Trade Alert*
━━━━━━━━━━━━━━━
Asset: ${trade.asset}
Action: ${trade.action.toUpperCase()}
Size: $${trade.size?.toFixed(2) || 'N/A'}
Entry: $${trade.price?.toFixed(2) || 'Market'}
SL: ${trade.stopLoss ? `-${(trade.stopLoss * 100).toFixed(1)}%` : 'N/A'}
TP: ${trade.takeProfit ? `+${(trade.takeProfit * 100).toFixed(1)}%` : 'N/A'}
Confidence: ${(trade.confidence * 100).toFixed(0)}%
Strategy: ${trade.strategy || 'ensemble'}
━━━━━━━━━━━━━━━
${trade.reasoning || ''}
    `.trim();
    
    return this.send(message);
  }
  
  /**
   * Send PnL report
   */
  async sendPnLReport(pnl, equity) {
    const emoji = pnl.total >= 0 ? '📈' : '📉';
    const message = `
${emoji} *Daily PnL Report*
━━━━━━━━━━━━━━━
Total: $${pnl.total.toFixed(2)} (${pnl.percent}%)
Equity: $${equity.toFixed(2)}
Trades: ${pnl.trades}
Win Rate: ${pnl.winRate}%
Wins: ${pnl.wins} | Losses: ${pnl.losses}
━━━━━━━━━━━━━━━
    `.trim();
    
    return this.send(message);
  }
  
  /**
   * Send circuit breaker alert
   */
  async sendCircuitBreakerAlert(reason) {
    const message = `
🚨 *CIRCUIT BREAKER TRIGGERED*
━━━━━━━━━━━━━━━
Reason: ${reason}
Status: ALL TRADING HALTED
Action Required: Manual review
━━━━━━━━━━━━━━━
    `.trim();
    
    return this.send(message);
  }
  
  /**
   * Send approval request
   */
  async sendApprovalRequest(trade) {
    const message = `
⚠️ *Trade Approval Required*
━━━━━━━━━━━━━━━
Asset: ${trade.asset}
Action: ${trade.action.toUpperCase()}
Size: $${trade.positionSizeUsd?.toFixed(2)}
Entry: $${trade.entryPrice?.toFixed(2) || 'Market'}

This trade exceeds $500 and requires approval.

Reply: APPROVE or REJECT
━━━━━━━━━━━━━━━
    `.trim();
    
    return this.send(message);
  }
}

export default WhatsAppNotifier;
