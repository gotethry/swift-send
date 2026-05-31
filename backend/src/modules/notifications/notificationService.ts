import { getSession } from '../../auth/sessionStore';
import type { EventBus } from '../../core/eventBus';
import { deviceTokenService } from './deviceTokenService';
import { sendMulticastPushNotification } from '../../utils/fcmMessaging';
import { PriorityCalculator, type PriorityLevel, type PriorityMetadata } from './priorityCalculator';
import { DeliveryStrategySelector } from './deliveryStrategySelector';
import { NotificationGrouper, type NotificationGroup } from './notificationGrouper';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';
export type NotificationChannel = 'email' | 'sms' | 'in_app';
export type NotificationStatus = 'sent' | 'skipped' | 'failed';

export interface NotificationDelivery {
  channel: NotificationChannel;
  status: NotificationStatus;
  target?: string;
  sentAt?: string;
  reason?: string;
}

export interface UserNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  readAt?: string;
  transferId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  deliveries: NotificationDelivery[];
}

export interface UnreadCounts {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface EnrichedNotificationList {
  items: (UserNotification & PriorityMetadata)[];
  groups: NotificationGroup[];
  unreadCounts: UnreadCounts;
}

export class NotificationService {
  private readonly store = new Map<string, UserNotification[]>();
  private readonly priorityCalculator = new PriorityCalculator();
  private readonly deliveryStrategySelector = new DeliveryStrategySelector();
  private readonly notificationGrouper = new NotificationGrouper();

  constructor(
    private readonly eventBus: EventBus,
    initialNotifications: UserNotification[] = [],
  ) {
    initialNotifications.forEach((notification) => {
      const list = this.store.get(notification.userId) || [];
      list.push(notification);
      this.store.set(notification.userId, this.sortNotifications(list));
    });
  }

  listByUserId(userId: string, limit = 10) {
    const items = (this.store.get(userId) || []).slice(0, Math.max(0, limit));
    return {
      items,
      unreadCount: (this.store.get(userId) || []).filter((item) => !item.readAt).length,
    };
  }

  /**
   * Enhanced list method with priority, grouping, and unread counts.
   */
  listByUserIdEnriched(userId: string, limit = 10): EnrichedNotificationList {
    const allNotifications = this.store.get(userId) || [];
    
    // Enrich with priority metadata
    const enriched = allNotifications.map((n) =>
      this.priorityCalculator.enrichWithPriority(n),
    );

    // Sort by priority then timestamp
    const sorted = this.sortByPriorityAndTimestamp(enriched);

    // Group notifications
    const { groups, ungrouped } = this.notificationGrouper.groupNotifications(sorted);

    // Sort groups by priority and timestamp
    const sortedGroups = this.sortGroupsByPriorityAndTimestamp(groups);

    // Calculate unread counts
    const unreadCounts = this.calculateUnreadCounts(enriched);

    // Apply limit to ungrouped items
    const limitedItems = ungrouped.slice(0, Math.max(0, limit));

    return {
      items: limitedItems,
      groups: sortedGroups,
      unreadCounts,
    };
  }

  markAsRead(userId: string, notificationId: string) {
    const notifications = this.store.get(userId) || [];
    const nextItems = notifications.map((item) =>
      item.id === notificationId && !item.readAt
        ? { ...item, readAt: new Date().toISOString() }
        : item,
    );
    this.store.set(userId, nextItems);
    void this.eventBus.publish({
      type: 'notification.read',
      timestamp: new Date().toISOString(),
      payload: { userId, notificationId },
    });
    return nextItems.find((item) => item.id === notificationId) || null;
  }

  async notifyTransferSettled(payload: {
    userId: string;
    transferId: string;
    amount: number;
    recipientName: string;
  }) {
    return this.createForUser(payload.userId, {
      transferId: payload.transferId,
      type: 'success',
      title: 'Transfer confirmed',
      message: `$${payload.amount.toFixed(2)} to ${payload.recipientName} completed successfully.`,
      metadata: { kind: 'transfer_settled' },
    });
  }

  async notifyTransferFailed(payload: {
    userId: string;
    transferId: string;
    amount: number;
    recipientName: string;
    error?: string;
  }) {
    return this.createForUser(payload.userId, {
      transferId: payload.transferId,
      type: 'error',
      title: 'Transfer failed',
      message: `We could not deliver $${payload.amount.toFixed(2)} to ${payload.recipientName}. ${payload.error || 'Your funds were returned to your wallet.'}`,
      metadata: { kind: 'transfer_failed' },
    });
  }

  async notifyFraudFlagged(payload: {
    userId: string;
    transferId: string;
    score: number;
    flags: string[];
  }) {
    return this.createForUser(payload.userId, {
      transferId: payload.transferId,
      type: 'warning',
      title: 'Transfer flagged for review',
      message: `We detected unusual activity on a recent transfer. Risk score ${payload.score}/100. ${payload.flags.join(', ')}`,
      metadata: { kind: 'fraud_flagged', flags: payload.flags, score: payload.score },
    });
  }

  async notifyEscrowCreated(payload: {
    userId: string;
    transferId: string;
    amount: number;
    currency: string;
    expectedReleaseAt?: string;
  }) {
    return this.createForUser(payload.userId, {
      transferId: payload.transferId,
      type: 'info',
      title: 'Escrow created',
      message: `$${payload.amount.toFixed(2)} ${payload.currency} held in escrow for transfer ${payload.transferId.slice(0, 8)}.${payload.expectedReleaseAt ? ` Expected release: ${new Date(payload.expectedReleaseAt).toLocaleDateString()}.` : ''}`,
      metadata: {
        kind: 'escrow_created',
        amount: payload.amount,
        currency: payload.currency,
        expectedReleaseAt: payload.expectedReleaseAt,
      },
    });
  }

  async notifyEscrowReleased(payload: {
    userId: string;
    transferId: string;
    amount: number;
    currency: string;
    destinationAccount?: string;
  }) {
    return this.createForUser(payload.userId, {
      transferId: payload.transferId,
      type: 'success',
      title: 'Escrow released',
      message: `$${payload.amount.toFixed(2)} ${payload.currency} has been released from escrow and sent to the recipient.`,
      metadata: {
        kind: 'escrow_released',
        amount: payload.amount,
        currency: payload.currency,
      },
    });
  }

  async notifyEscrowRefunded(payload: {
    userId: string;
    transferId: string;
    amount: number;
    currency: string;
    reason?: string;
  }) {
    return this.createForUser(payload.userId, {
      transferId: payload.transferId,
      type: 'warning',
      title: 'Escrow refunded',
      message: `$${payload.amount.toFixed(2)} ${payload.currency} has been refunded from escrow.${payload.reason ? ` Reason: ${payload.reason}` : ''}`,
      metadata: {
        kind: 'escrow_refunded',
        amount: payload.amount,
        currency: payload.currency,
        reason: payload.reason,
      },
    });
  }

  async notifyEscrowDisputed(payload: {
    userId: string;
    transferId: string;
    amount: number;
    currency: string;
    reason?: string;
  }) {
    return this.createForUser(payload.userId, {
      transferId: payload.transferId,
      type: 'error',
      title: 'Escrow disputed',
      message: `A dispute has been opened for escrow holding $${payload.amount.toFixed(2)} ${payload.currency}.${payload.reason ? ` Reason: ${payload.reason}` : ''} Funds are frozen pending resolution.`,
      metadata: {
        kind: 'escrow_disputed',
        amount: payload.amount,
        currency: payload.currency,
        reason: payload.reason,
      },
    });
  }

  async notifyEscrowDelayed(payload: {
    userId: string;
    transferId: string;
    amount: number;
    currency: string;
    delayReason?: string;
  }) {
    return this.createForUser(payload.userId, {
      transferId: payload.transferId,
      type: 'warning',
      title: 'Escrow release delayed',
      message: `The release of $${payload.amount.toFixed(2)} ${payload.currency} from escrow has been delayed.${payload.delayReason ? ` Reason: ${payload.delayReason}` : ' We are working to resolve this.'}`,
      metadata: {
        kind: 'escrow_delayed',
        amount: payload.amount,
        currency: payload.currency,
        delayReason: payload.delayReason,
      },
    });
  }

  async notifyEscrowExpired(payload: {
    userId: string;
    transferId: string;
    amount: number;
    currency: string;
  }) {
    return this.createForUser(payload.userId, {
      transferId: payload.transferId,
      type: 'warning',
      title: 'Escrow expired',
      message: `Escrow for transfer ${payload.transferId.slice(0, 8)} expired before settlement. Funds were returned to the sender wallet.`,
      actionUrl: `/admin/operations?tab=escrow&transferId=${encodeURIComponent(payload.transferId)}`,
      metadata: {
        kind: 'escrow_expired',
        amount: payload.amount,
        currency: payload.currency,
      },
    });
  }

  async notifySecurityEvent(payload: {
    userId: string;
    kind: 'reauth_required' | 'access_blocked' | 'step_up_completed';
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.createForUser(payload.userId, {
      type: payload.kind === 'step_up_completed' ? 'success' : payload.kind === 'access_blocked' ? 'error' : 'warning',
      title: payload.title,
      message: payload.message,
      metadata: { kind: payload.kind, ...(payload.metadata ?? {}) },
    });
  }

  private async createForUser(
    userId: string,
    input: {
      type: NotificationType;
      title: string;
      message: string;
      transferId?: string;
      actionUrl?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const createdAt = new Date().toISOString();
    const notification: UserNotification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      createdAt,
      transferId: input.transferId,
      actionUrl: this.resolveActionUrl(input),
      metadata: input.metadata,
      deliveries: this.buildDeliveries(userId, createdAt),
    };

    const items = this.store.get(userId) || [];
    this.store.set(userId, this.sortNotifications([notification, ...items]));

    void this.eventBus.publish({
      type: 'notification.created',
      timestamp: createdAt,
      payload: {
        userId,
        notificationId: notification.id,
        type: notification.type,
      },
    });

    await this.sendPushNotification(notification);
    return notification;
  }

  private async sendPushNotification(notification: UserNotification) {
    try {
      const tokens = await deviceTokenService.getActiveTokenStrings(notification.userId);
      if (tokens.length === 0) {
        return;
      }

      const pushData = {
        type: String(notification.metadata?.kind || notification.type),
        transferId: notification.transferId || '',
        notificationId: notification.id,
        actionUrl: notification.actionUrl || '',
      };

      const result = await sendMulticastPushNotification(
        tokens,
        notification.title,
        notification.message,
        pushData,
      );

      if (result.failedTokens.length > 0) {
        await Promise.all(
          result.failedTokens.map((token) => deviceTokenService.deactivateDeviceToken(token)),
        );
      }
    } catch (error) {
      console.error('failed to send push notification', error);
    }
  }

  private buildDeliveries(userId: string, timestamp: string): NotificationDelivery[] {
    const session = getSession(userId);
    const deliveries: NotificationDelivery[] = [
      { channel: 'in_app', status: 'sent', sentAt: timestamp },
    ];

    if (session?.email) {
      deliveries.push({
        channel: 'email',
        status: 'sent',
        sentAt: timestamp,
        target: session.email,
      });
    } else {
      deliveries.push({
        channel: 'email',
        status: 'skipped',
        reason: 'No email on file',
      });
    }

    if (session?.phone) {
      deliveries.push({
        channel: 'sms',
        status: 'sent',
        sentAt: timestamp,
        target: session.phone,
      });
    } else {
      deliveries.push({
        channel: 'sms',
        status: 'skipped',
        reason: 'No phone number on file',
      });
    }

    return deliveries;
  }

  private sortNotifications(items: UserNotification[]) {
    return items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  private resolveActionUrl(input: {
    transferId?: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (input.actionUrl) {
      return input.actionUrl;
    }

    const kind = input.metadata?.kind;
    const transferId = input.transferId;

    if (transferId && kind === 'transfer_settled') {
      return `/history?transferId=${encodeURIComponent(transferId)}`;
    }

    if (transferId && kind === 'transfer_failed') {
      return `/history?transferId=${encodeURIComponent(transferId)}`;
    }

    if (transferId && String(kind || '').startsWith('escrow_')) {
      return `/admin/operations?tab=escrow&transferId=${encodeURIComponent(transferId)}`;
    }

    if (transferId && kind === 'fraud_flagged') {
      return `/admin/operations?tab=aml&transferId=${encodeURIComponent(transferId)}`;
    }

    return undefined;
  }

  /**
   * Sort notifications by priority (critical > high > medium > low) then timestamp (newest first).
   */
  private sortByPriorityAndTimestamp(
    notifications: (UserNotification & PriorityMetadata)[],
  ): (UserNotification & PriorityMetadata)[] {
    const priorityOrder: Record<PriorityLevel, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return [...notifications].sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * Sort groups by representative notification priority and timestamp.
   */
  private sortGroupsByPriorityAndTimestamp(groups: NotificationGroup[]): NotificationGroup[] {
    const priorityOrder: Record<PriorityLevel, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return [...groups].sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * Calculate unread counts per priority level.
   */
  private calculateUnreadCounts(
    notifications: (UserNotification & PriorityMetadata)[],
  ): UnreadCounts {
    const unread = notifications.filter((n) => !n.readAt);
    
    return {
      total: unread.length,
      critical: unread.filter((n) => n.priority === 'critical').length,
      high: unread.filter((n) => n.priority === 'high').length,
      medium: unread.filter((n) => n.priority === 'medium').length,
      low: unread.filter((n) => n.priority === 'low').length,
    };
  }
}
