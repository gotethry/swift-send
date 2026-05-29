import { createHmac } from 'crypto';
import { config, webhookConfig, retryConfig } from '../../config';
import type { EventBus, DomainEvent } from '../../core/eventBus';
import { createLogger } from '../../logger';
import { retryWithBackoff } from '../../utils/retry';

const logger = createLogger({ component: 'webhookDispatcher' });

export interface WebhookEndpoint {
  name: string;
  url: string;
  secret: string;
}

export class WebhookDispatcher {
  private endpoints: WebhookEndpoint[];

  constructor(private readonly eventBus: EventBus, endpoints?: WebhookEndpoint[]) {
    this.endpoints = endpoints ?? webhookConfig.endpoints ?? [];

    // Subscribe to important domain events
    this.eventBus.subscribe('transfer.settled', (e) => void this.handleEvent(e));
    this.eventBus.subscribe('transfer.failed', (e) => void this.handleEvent(e));
    this.eventBus.subscribe('transfer.created', (e) => void this.handleEvent(e));
    this.eventBus.subscribe('notification.created', (e) => void this.handleEvent(e));
  }

  private async handleEvent(event: DomainEvent) {
    const body = JSON.stringify(event.payload ?? {});
    const ts = Math.floor(Date.now() / 1000).toString();

    for (const ep of this.endpoints) {
      void this.dispatchToEndpoint(ep, event.type, body, ts).catch((err) => {
        logger.error({ err: err instanceof Error ? err.message : String(err), endpoint: ep.name, event: event.type }, 'webhook dispatch failed');
      });
    }
  }

  private async dispatchToEndpoint(endpoint: WebhookEndpoint, eventType: string, body: string, timestampSec: string) {
    const payloadToSign = body;
    const signature = createHmac('sha256', endpoint.secret || webhookConfig.sharedSecret || '')
      .update(payloadToSign)
      .digest('hex');

    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': timestampSec,
      'X-Webhook-Signature': `sha256=${signature}`,
      'X-Webhook-Event': eventType,
      'User-Agent': 'swiftsend-webhook-dispatcher/1.0',
    } as Record<string, string>;

    // Use retry wrapper for transient network errors
    await retryWithBackoff(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal as any,
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`http ${res.status} ${res.statusText} ${text}`);
        }
        logger.info({ endpoint: endpoint.name, eventType }, 'webhook dispatched');
      } finally {
        clearTimeout(timeout);
      }
    }, {
      maxRetries: retryConfig.maxRetries,
      baseDelayMs: retryConfig.baseDelayMs,
      maxDelayMs: retryConfig.maxDelayMs,
      timeoutMs: retryConfig.timeoutMs,
      jitterFactor: 0.3,
      metricName: 'webhook_dispatch',
    }, (evt) => {
      // publish lightweight events for monitoring
      void this.eventBus.publish({ type: 'webhook.dispatch_event', timestamp: new Date().toISOString(), payload: { endpoint: endpoint.name, event: eventType, evt } });
    });
  }
}
