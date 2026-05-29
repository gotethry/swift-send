import { createLogger } from '../../logger';
import { config } from '../../config';
import { EventEmitter } from 'events';

export type SecurityEventLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type SecurityEventType =
  | 'AUTH_ATTEMPT'
  | 'AUTH_FAILURE'
  | 'AUTH_SUCCESS'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'UNAUTHORIZED_ACCESS'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'DATA_BREACH_ATTEMPT'
  | 'INVALID_INPUT'
  | 'CONFIGURATION_CHANGE'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_ACCESS'
  | 'TRANSACTION_ANOMALY'
  | 'SYSTEM_AUDIT';

export interface SecurityEvent {
  id: string;
  timestamp: number;
  level: SecurityEventLevel;
  type: SecurityEventType;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  resourceId?: string;
  action: string;
  details: Record<string, unknown>;
  source: string;
  sessionId?: string;
}

export interface SecurityEventFilter {
  level?: SecurityEventLevel;
  type?: SecurityEventType;
  userId?: string;
  startTime?: number;
  endTime?: number;
  source?: string;
}

interface EventBuffer {
  events: SecurityEvent[];
  timestamp: number;
}

class SecurityEventsService extends EventEmitter {
  private logger: Logger;
  private eventBuffer: EventBuffer;
  private readonly BUFFER_SIZE = 100;
  private readonly BUFFER_FLUSH_INTERVAL_MS = 5000; // 5 seconds
  private flushInterval: NodeJS.Timer | null = null;
  private readonly CRITICAL_EVENTS_THRESHOLD = 5; // Per minute
  private criticalEventCounts: Map<string, number[]> = new Map();
  private readonly EVENT_RETENTION_MS = 60 * 60 * 1000; // 1 hour
  private eventHistory: Map<string, SecurityEvent[]> = new Map();

  constructor() {
    super();
    this.logger = createLogger({ component: 'securityEventsService' });
    this.eventBuffer = {
      events: [],
      timestamp: Date.now(),
    };
    this.initializeBufferFlushing();
    this.setupEventListeners();
  }

  /**
   * Ingest a security event
   * @param event - Security event to ingest
   */
  public ingestEvent(
    type: SecurityEventType,
    level: SecurityEventLevel,
    action: string,
    details: Record<string, unknown> = {},
    context?: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      resourceId?: string;
      sessionId?: string;
    }
  ): SecurityEvent {
    const event: SecurityEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      level,
      type,
      userId: context?.userId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      resourceId: context?.resourceId,
      action,
      details,
      source: this.getServiceName(),
      sessionId: context?.sessionId,
    };

    // Validate event data
    this.validateEvent(event);

    // Check for anomalies
    this.checkForAnomalies(event);

    // Add to buffer
    this.eventBuffer.events.push(event);

    // Store in history for retention
    this.storeInHistory(event);

    // Emit event for real-time processing
    this.emit('event', event);

    // Log based on level
    this.logEvent(event);

    // Flush buffer if threshold reached
    if (this.eventBuffer.events.length >= this.BUFFER_SIZE) {
      this.flushBuffer();
    }

    return event;
  }

  /**
   * Query events from history
   * @param filter - Filter criteria
   * @param limit - Maximum number of events to return
   */
  public queryEvents(filter: SecurityEventFilter = {}, limit: number = 100): SecurityEvent[] {
    const results: SecurityEvent[] = [];
    const now = Date.now();

    // Iterate through history
    for (const events of this.eventHistory.values()) {
      for (const event of events) {
        // Check if event matches all filter criteria
        if (this.matchesFilter(event, filter)) {
          results.push(event);
        }

        if (results.length >= limit) {
          return results;
        }
      }
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get events for a specific user
   * @param userId - User identifier
   * @param limit - Maximum number of events to return
   */
  public getUserEvents(userId: string, limit: number = 50): SecurityEvent[] {
    return this.queryEvents({ userId }, limit);
  }

  /**
   * Get recent events of a specific type
   * @param type - Event type
   * @param limit - Maximum number of events to return
   */
  public getEventsByType(type: SecurityEventType, limit: number = 50): SecurityEvent[] {
    return this.queryEvents({ type }, limit);
  }

  /**
   * Get event statistics
   */
  public getStatistics(): {
    bufferedEvents: number;
    historicalEvents: number;
    criticalEventsPerMinute: number;
  } {
    let totalHistorical = 0;
    for (const events of this.eventHistory.values()) {
      totalHistorical += events.length;
    }

    const criticalPerMinute = Array.from(this.criticalEventCounts.values()).reduce(
      (sum, counts) => sum + counts.length,
      0
    );

    return {
      bufferedEvents: this.eventBuffer.events.length,
      historicalEvents: totalHistorical,
      criticalEventsPerMinute: criticalPerMinute,
    };
  }

  /**
   * Clear event history
   */
  public clearHistory(): void {
    this.eventHistory.clear();
    this.criticalEventCounts.clear();
    this.logger.info('Security event history cleared');
  }

  /**
   * Flush buffered events
   */
  public flushBuffer(): void {
    if (this.eventBuffer.events.length === 0) {
      return;
    }

    try {
      const eventCount = this.eventBuffer.events.length;
      this.logger.info('Flushing security events buffer', { eventCount });

      // Emit flush event for external processing (e.g., database, logging service)
      this.emit('flush', {
        events: [...this.eventBuffer.events],
        timestamp: Date.now(),
      });

      this.eventBuffer.events = [];
      this.eventBuffer.timestamp = Date.now();
    } catch (error) {
      this.logger.error('Error flushing security events buffer', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush
    this.flushBuffer();

    this.eventHistory.clear();
    this.criticalEventCounts.clear();
    this.removeAllListeners();
    this.logger.debug('SecurityEventsService destroyed');
  }

  // Private methods

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get service name from configuration
   */
  private getServiceName(): string {
    return config.get('SERVICE_NAME') || 'unknown-service';
  }

  /**
   * Validate event data
   */
  private validateEvent(event: SecurityEvent): void {
    if (!event.type || !event.action) {
      throw new Error('Event type and action are required');
    }

    if (!['INFO', 'WARNING', 'ERROR', 'CRITICAL'].includes(event.level)) {
      throw new Error('Invalid event level');
    }

    if (event.details && typeof event.details !== 'object') {
      throw new Error('Event details must be an object');
    }
  }

  /**
   * Check for security anomalies
   */
  private checkForAnomalies(event: SecurityEvent): void {
    // Check critical event frequency
    if (event.level === 'CRITICAL') {
      this.trackCriticalEvent(event.type);
    }

    // Check for suspicious patterns
    if (event.type === 'AUTH_FAILURE') {
      const userFailures = this.queryEvents({ userId: event.userId, type: 'AUTH_FAILURE' }, 10);
      if (userFailures.length >= 5) {
        const timeDiff = event.timestamp - userFailures[userFailures.length - 1].timestamp;
        if (timeDiff < 60000) {
          // 5 failures in 1 minute
          this.logger.warn('Potential brute force attack detected', {
            userId: event.userId,
            failureCount: userFailures.length,
          });
        }
      }
    }
  }

  /**
   * Track critical event occurrences
   */
  private trackCriticalEvent(eventType: SecurityEventType): void {
    const now = Date.now();
    const minuteAgo = now - 60000;

    if (!this.criticalEventCounts.has(eventType)) {
      this.criticalEventCounts.set(eventType, []);
    }

    const timestamps = this.criticalEventCounts.get(eventType)!;
    // Keep only events from last minute
    const recentEvents = timestamps.filter((ts) => ts > minuteAgo);
    recentEvents.push(now);

    if (recentEvents.length > this.CRITICAL_EVENTS_THRESHOLD) {
      this.logger.error('Critical event threshold exceeded', {
        eventType,
        count: recentEvents.length,
      });
    }

    this.criticalEventCounts.set(eventType, recentEvents);
  }

  /**
   * Store event in history with retention policy
   */
  private storeInHistory(event: SecurityEvent): void {
    const key = `${event.type}_${Math.floor(event.timestamp / 60000)}`; // Group by type and minute

    if (!this.eventHistory.has(key)) {
      this.eventHistory.set(key, []);
    }

    this.eventHistory.get(key)!.push(event);

    // Cleanup old entries
    this.cleanupOldEvents();
  }

  /**
   * Remove events older than retention period
   */
  private cleanupOldEvents(): void {
    const cutoffTime = Date.now() - this.EVENT_RETENTION_MS;

    for (const [key, events] of this.eventHistory) {
      const filtered = events.filter((e) => e.timestamp > cutoffTime);

      if (filtered.length === 0) {
        this.eventHistory.delete(key);
      } else if (filtered.length < events.length) {
        this.eventHistory.set(key, filtered);
      }
    }
  }

  /**
   * Match event against filter criteria
   */
  private matchesFilter(event: SecurityEvent, filter: SecurityEventFilter): boolean {
    if (filter.level && event.level !== filter.level) return false;
    if (filter.type && event.type !== filter.type) return false;
    if (filter.userId && event.userId !== filter.userId) return false;
    if (filter.source && event.source !== filter.source) return false;

    if (filter.startTime && event.timestamp < filter.startTime) return false;
    if (filter.endTime && event.timestamp > filter.endTime) return false;

    return true;
  }

  /**
   * Log event based on level
   */
  private logEvent(event: SecurityEvent): void {
    const logData = {
      eventId: event.id,
      type: event.type,
      userId: event.userId,
      action: event.action,
    };

    switch (event.level) {
      case 'CRITICAL':
        this.logger.error(`[CRITICAL] ${event.action}`, logData);
        break;
      case 'ERROR':
        this.logger.error(event.action, logData);
        break;
      case 'WARNING':
        this.logger.warn(event.action, logData);
        break;
      case 'INFO':
        this.logger.info(event.action, logData);
        break;
    }
  }

  /**
   * Initialize buffer flushing interval
   */
  private initializeBufferFlushing(): void {
    this.flushInterval = setInterval(() => {
      this.flushBuffer();
    }, this.BUFFER_FLUSH_INTERVAL_MS);

    if (this.flushInterval && typeof this.flushInterval.unref === 'function') {
      this.flushInterval.unref();
    }
  }

  /**
   * Setup event listeners for processing
   */
  private setupEventListeners(): void {
    // Listen for high-volume events
    this.on('event', (event: SecurityEvent) => {
      if (event.level === 'CRITICAL') {
        this.emit('criticalEvent', event);
      }
    });
  }
}

// Export singleton instance
export const securityEventsService = new SecurityEventsService();
export default SecurityEventsService;
