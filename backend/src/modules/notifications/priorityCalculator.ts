import type { UserNotification } from './notificationService';

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface PriorityMetadata {
  priority: PriorityLevel;
  priorityColor: 'red' | 'orange' | 'blue' | 'gray';
  isCritical: boolean;
}

export class PriorityCalculator {
  /**
   * Calculate priority level for a notification.
   * 
   * Rules:
   * - fraud_flagged metadata → critical
   * - error type + transfer_failed metadata → critical
   * - warning type → high
   * - success type + transfer_settled metadata → medium
   * - info type → low
   * - default → medium
   */
  calculatePriority(notification: UserNotification): PriorityLevel {
    const kind = notification.metadata?.kind as string | undefined;
    
    if (kind === 'fraud_flagged' || kind === 'escrow_disputed' || kind === 'escrow_expired') {
      return 'critical';
    }
    
    if ((notification.type === 'error' && kind === 'transfer_failed') || kind === 'escrow_delayed') {
      return 'critical';
    }
    
    if (notification.type === 'warning' || kind === 'escrow_refunded') {
      return 'high';
    }
    
    if (notification.type === 'success' && (kind === 'transfer_settled' || kind === 'escrow_released')) {
      return 'medium';
    }
    
    if (notification.type === 'info' || kind === 'escrow_created') {
      return 'low';
    }
    
    return 'medium';
  }

  /**
   * Enrich notification with priority metadata.
   */
  enrichWithPriority(notification: UserNotification): UserNotification & PriorityMetadata {
    const priority = this.calculatePriority(notification);
    return {
      ...notification,
      priority,
      priorityColor: this.getPriorityColor(priority),
      isCritical: priority === 'critical',
    };
  }

  private getPriorityColor(priority: PriorityLevel): 'red' | 'orange' | 'blue' | 'gray' {
    const colorMap: Record<PriorityLevel, 'red' | 'orange' | 'blue' | 'gray'> = {
      critical: 'red',
      high: 'orange',
      medium: 'blue',
      low: 'gray',
    };
    return colorMap[priority];
  }
}
