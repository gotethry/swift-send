import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import type { JwtSessionPayload } from '../auth/sessionTypes';
import { RateLimiter } from '../auth/rateLimiter';

interface RegisterBody {
  url: string;
  events: string[];
  secret?: string;
}

interface RetryParams {
  id: string;
  deliveryId: string;
}

const retryRateLimiter = new RateLimiter({
  maxAttempts: 10,
  windowMs: 10 * 60 * 1000,
  lockoutDurationMs: 10 * 60 * 1000,
});

const guards = { preHandler: [requireVerifiedSession] };

export default async function webhookRoutes(fastify: FastifyInstance) {
  /** POST /webhooks — register a new webhook */
  fastify.post<{ Body: RegisterBody }>('/webhooks', guards, async (req, reply) => {
    const { url, events, secret } = req.body ?? {};
    if (!url || !Array.isArray(events) || !events.length) {
      return reply.code(400).send({ error: '`url` (string) and `events` (non-empty array) are required' });
    }
    const payload = req.user as JwtSessionPayload;
    const webhook = fastify.container.services.webhooks.register(payload.sub, url, events, secret);
    return reply.code(201).send(webhook);
  });

  /** GET /webhooks — list the authenticated user's webhooks */
  fastify.get('/webhooks', guards, async (req) => {
    const payload = req.user as JwtSessionPayload;
    return fastify.container.services.webhooks.list(payload.sub);
  });

  /** GET /webhooks/:id — get a single webhook */
  fastify.get<{ Params: { id: string } }>('/webhooks/:id', guards, async (req, reply) => {
    const payload = req.user as JwtSessionPayload;
    const webhook = fastify.container.services.webhooks.get(req.params.id, payload.sub);
    if (!webhook) return reply.code(404).send({ error: 'Webhook not found' });
    return webhook;
  });

  /** DELETE /webhooks/:id — deactivate a webhook */
  fastify.delete<{ Params: { id: string } }>('/webhooks/:id', guards, async (req, reply) => {
    const payload = req.user as JwtSessionPayload;
    const ok = fastify.container.services.webhooks.deactivate(req.params.id, payload.sub);
    if (!ok) return reply.code(404).send({ error: 'Webhook not found' });
    return { deactivated: true };
  });

  /** POST /webhooks/:id/rotate-secret — rotate the HMAC signing secret */
  fastify.post<{ Params: { id: string } }>('/webhooks/:id/rotate-secret', guards, async (req, reply) => {
    const payload = req.user as JwtSessionPayload;
    const webhook = fastify.container.services.webhooks.rotateSecret(req.params.id, payload.sub);
    if (!webhook) return reply.code(404).send({ error: 'Webhook not found' });
    return { id: webhook.id, secret: webhook.secret };
  });

  /** GET /webhooks/:id/deliveries — delivery history */
  fastify.get<{ Params: { id: string } }>('/webhooks/:id/deliveries', guards, async (req, reply) => {
    const payload = req.user as JwtSessionPayload;
    const deliveries = fastify.container.services.webhooks.getDeliveries(req.params.id, payload.sub);
    return deliveries;
  });

  /** POST /webhooks/:id/deliveries/:deliveryId/retry — manual retry (rate-limited) */
  fastify.post<{ Params: RetryParams }>(
    '/webhooks/:id/deliveries/:deliveryId/retry',
    guards,
    async (req, reply) => {
      const payload = req.user as JwtSessionPayload;
      if (retryRateLimiter.isLimited(payload.sub)) {
        return reply.code(429).send({ error: 'Too many retry requests. Please wait before retrying.' });
      }
      retryRateLimiter.recordAttempt(payload.sub);
      const ok = await fastify.container.services.webhooks.retryDelivery(
        req.params.deliveryId,
        payload.sub,
      );
      if (!ok) return reply.code(404).send({ error: 'Delivery not found' });
      return { retried: true };
    },
  );
}
