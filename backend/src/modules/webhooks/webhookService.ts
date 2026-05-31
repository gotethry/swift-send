import { randomBytes, createHmac } from 'crypto';
import { lookup as dnsLookup } from 'dns';
import { promisify } from 'util';
import { v4 as uuid } from 'uuid';
import { createLogger } from '../../logger';
import { AppError } from '../../errors';
import type { EventBus } from '../../core/eventBus';
import { TransferEventType } from '../transfers/events';

const dnsLookupAsync = promisify(dnsLookup);

export interface WebhookRegistration {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'dead_letter';

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  attempts: number;
  nextRetryAt?: string;
  deliveredAt?: string;
  createdAt: string;
}

// Retry schedule delays in ms (±20% jitter applied at call time)
const RETRY_DELAYS_MS = [0, 60_000, 300_000, 1_800_000, 7_200_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

/**
 * Returns true if the given IPv4 address string falls in a non-public range.
 * Covers: loopback (127/8), private (10/8, 172.16/12, 192.168/16),
 * link-local (169.254/16), CGNAT (100.64/10), unspecified (0.0.0.0),
 * broadcast (255.255.255.255).
 */
function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;
  const [a, b] = parts;
  return (
    a === 0 ||                                        // 0.0.0.0/8
    a === 10 ||                                       // 10.0.0.0/8
    a === 127 ||                                      // 127.0.0.0/8 (loopback)
    a === 255 ||                                      // 255.255.255.255
    (a === 100 && b >= 64 && b <= 127) ||             // 100.64.0.0/10 (CGNAT)
    (a === 169 && b === 254) ||                       // 169.254.0.0/16 (link-local)
    (a === 172 && b >= 16 && b <= 31) ||              // 172.16.0.0/12
    (a === 192 && b === 168)                          // 192.168.0.0/16
  );
}

function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  return (
    lower === '::1' ||                                // loopback
    lower === '::' ||                                 // unspecified
    lower.startsWith('fc') ||                         // fc00::/7 (ULA)
    lower.startsWith('fd') ||                         // fd00::/8 (ULA)
    lower.startsWith('fe80') ||                       // fe80::/10 (link-local)
    lower.startsWith('::ffff:')                       // IPv4-mapped IPv6
  );
}

/** Throws if the resolved IP of the hostname is in a non-routable range (DNS-rebinding safe). */
async function assertHostIsPublic(hostname: string): Promise<void> {
  let address: string;
  let family: number;
  try {
    const result = await dnsLookupAsync(hostname);
    // dnsLookupAsync with promisify returns { address, family }
    address = (result as unknown as { address: string; family: number }).address;
    family = (result as unknown as { address: string; family: number }).family;
  } catch {
    throw new AppError('Webhook URL hostname could not be resolved', 'invalid_webhook_url', 400);
  }
  const blocked =
    family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
  if (blocked) {
    throw new AppError('Webhook URL must not target private network addresses', 'invalid_webhook_url', 400);
  }
}

/** Validates scheme synchronously; IP validation happens at send time via assertHostIsPublic(). */
function validateWebhookUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('Invalid webhook URL', 'invalid_webhook_url', 400);
  }
  if (parsed.protocol !== 'https:') {
    throw new AppError('Webhook URL must use HTTPS', 'invalid_webhook_url', 400);
  }
  return parsed;
}

function addJitter(delayMs: number): number {
  if (delayMs === 0) return 0;
  const jitter = delayMs * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, delayMs + jitter);
}

function signPayload(secret: string, timestamp: number, body: string): string {
  const signed = `${timestamp}.${body}`;
  const sig = createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

const SUBSCRIBED_EVENT_TYPES = [
  TransferEventType.Created,
  TransferEventType.StateChanged,
  TransferEventType.Settled,
  TransferEventType.Failed,
  TransferEventType.Flagged,
] as string[];

export class WebhookService {
  private readonly webhooks: WebhookRegistration[] = [];
  private readonly deliveries: WebhookDelivery[] = [];
  private readonly logger = createLogger({ component: 'webhookService' });

  constructor(private readonly eventBus: EventBus) {
    for (const eventType of SUBSCRIBED_EVENT_TYPES) {
      this.eventBus.subscribe<Record<string, unknown>>(eventType, async (event) => {
        await this.deliver(event.type, event.payload);
      });
    }
  }

  register(
    userId: string,
    url: string,
    events: string[],
    secret?: string,
  ): WebhookRegistration {
    validateWebhookUrl(url); // throws on bad scheme; IP check happens at send time
    if (!events.length) {
      throw new AppError('At least one event type is required', 'invalid_webhook', 400);
    }
    const webhook: WebhookRegistration = {
      id: uuid(),
      userId,
      url,
      secret: secret ?? randomBytes(32).toString('hex'),
      events,
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.webhooks.push(webhook);
    this.logger.info({ webhookId: webhook.id, userId, url, events }, 'webhook registered');
    return webhook;
  }

  list(userId: string): WebhookRegistration[] {
    return this.webhooks.filter((w) => w.userId === userId);
  }

  get(id: string, userId: string): WebhookRegistration | undefined {
    return this.webhooks.find((w) => w.id === id && w.userId === userId);
  }

  deactivate(id: string, userId: string): boolean {
    const webhook = this.webhooks.find((w) => w.id === id && w.userId === userId);
    if (!webhook) return false;
    webhook.active = false;
    this.logger.info({ webhookId: id, userId }, 'webhook deactivated');
    return true;
  }

  rotateSecret(id: string, userId: string): WebhookRegistration | undefined {
    const webhook = this.webhooks.find((w) => w.id === id && w.userId === userId);
    if (!webhook) return undefined;
    webhook.secret = randomBytes(32).toString('hex');
    this.logger.info({ webhookId: id, userId }, 'webhook secret rotated');
    return webhook;
  }

  getDeliveries(webhookId: string, userId: string): WebhookDelivery[] {
    const webhook = this.webhooks.find((w) => w.id === webhookId && w.userId === userId);
    if (!webhook) return [];
    return this.deliveries
      .filter((d) => d.webhookId === webhookId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async retryDelivery(deliveryId: string, userId: string): Promise<boolean> {
    const delivery = this.deliveries.find((d) => d.id === deliveryId);
    if (!delivery) return false;
    const webhook = this.webhooks.find((w) => w.id === delivery.webhookId && w.userId === userId);
    if (!webhook) return false;
    delivery.status = 'pending';
    delivery.attempts = 0;
    await this._sendWithRetry(delivery, webhook, 0);
    return true;
  }

  async deliver(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const targets = this.webhooks.filter(
      (w) => w.active && (w.events.includes(eventType) || w.events.includes('*')),
    );
    for (const webhook of targets) {
      const delivery: WebhookDelivery = {
        id: uuid(),
        webhookId: webhook.id,
        eventType,
        payload,
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString(),
      };
      this.deliveries.push(delivery);
      void this._sendWithRetry(delivery, webhook, 0);
    }
  }

  private async _sendWithRetry(
    delivery: WebhookDelivery,
    webhook: WebhookRegistration,
    attemptIndex: number,
  ): Promise<void> {
    if (attemptIndex >= MAX_ATTEMPTS) {
      delivery.status = 'dead_letter';
      this.logger.warn(
        { deliveryId: delivery.id, webhookId: webhook.id },
        'webhook delivery moved to dead letter after max attempts',
      );
      return;
    }

    const delay = addJitter(RETRY_DELAYS_MS[attemptIndex]);
    if (delay > 0) {
      delivery.nextRetryAt = new Date(Date.now() + delay).toISOString();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    delivery.attempts += 1;
    delivery.nextRetryAt = undefined;

    const body = JSON.stringify({ event: delivery.eventType, payload: delivery.payload });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(webhook.secret, timestamp, body);

    try {
      // Re-validate at send time to close the DNS-rebinding window:
      // the hostname is resolved now (not at registration) and the resolved
      // IP is checked against blocked ranges before the connection is made.
      const parsed = validateWebhookUrl(webhook.url);
      await assertHostIsPublic(parsed.hostname);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Id': webhook.id,
          'User-Agent': 'SwiftSend-Webhooks/1.0',
        },
        body,
        redirect: 'manual', // never follow redirects — a 3xx to a private URL would bypass SSRF protection
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        delivery.status = 'delivered';
        delivery.deliveredAt = new Date().toISOString();
        this.logger.info(
          { deliveryId: delivery.id, webhookId: webhook.id, attempt: delivery.attempts },
          'webhook delivered',
        );
        return;
      }

      // 3xx: redirects are not followed (redirect: 'manual') — treat as failure, no retry
      if (response.status >= 300 && response.status < 400) {
        delivery.status = 'failed';
        this.logger.warn(
          { deliveryId: delivery.id, status: response.status, attempt: delivery.attempts },
          'webhook delivery rejected redirect response (no retry)',
        );
        return;
      }

      // 4xx: terminal receiver error — do not retry
      if (response.status >= 400 && response.status < 500) {
        delivery.status = 'failed';
        this.logger.warn(
          { deliveryId: delivery.id, status: response.status, attempt: delivery.attempts },
          'webhook delivery failed with 4xx (no retry)',
        );
        return;
      }

      // 5xx: transient — schedule retry
      this.logger.warn(
        { deliveryId: delivery.id, status: response.status, attempt: delivery.attempts },
        'webhook delivery failed with 5xx, scheduling retry',
      );
    } catch (err) {
      // SSRF block or invalid URL — terminal, do not retry
      if (err instanceof AppError) {
        delivery.status = 'failed';
        this.logger.warn(
          { deliveryId: delivery.id, code: err.code, attempt: delivery.attempts },
          'webhook delivery blocked by SSRF check (no retry)',
        );
        return;
      }
      this.logger.warn(
        { deliveryId: delivery.id, err, attempt: delivery.attempts },
        'webhook delivery network error, scheduling retry',
      );
    }

    await this._sendWithRetry(delivery, webhook, attemptIndex + 1);
  }
}
