import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';

export interface VerifyWebhookOptions {
  secret?: string;
  toleratedWindowSeconds?: number;
}

export function verifyWebhook(options: VerifyWebhookOptions = {}) {
  const secret = options.secret || process.env.WEBHOOK_SHARED_SECRET || '' || config.encryption.key;
  const tolerated = options.toleratedWindowSeconds ?? intFromEnv(process.env.WEBHOOK_TIMESTAMP_WINDOW_SECONDS, 300);

  return async function (req: FastifyRequest, reply: FastifyReply) {
    try {
      const timestampHeader = (req.headers['x-webhook-timestamp'] || '') as string;
      const signatureHeader = (req.headers['x-webhook-signature'] || '') as string; // e.g. sha256=<hex>

      if (!timestampHeader || !signatureHeader) {
        return reply.code(401).send({ error: 'missing webhook signature headers' });
      }

      const ts = Number(timestampHeader);
      if (Number.isNaN(ts)) {
        return reply.code(401).send({ error: 'invalid timestamp' });
      }

      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - ts) > tolerated) {
        return reply.code(401).send({ error: 'webhook timestamp outside tolerated window' });
      }

      const expected = createHmac('sha256', secret)
        .update(JSON.stringify(req.body ?? {}))
        .digest('hex');

      const prefix = 'sha256=';
      if (!signatureHeader.startsWith(prefix)) return reply.code(401).send({ error: 'invalid signature format' });
      const providedHex = signatureHeader.slice(prefix.length);

      const provided = Buffer.from(providedHex, 'hex');
      const expectedBuf = Buffer.from(expected, 'hex');

      if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
        return reply.code(401).send({ error: 'invalid webhook signature' });
      }

      // allowed
      return;
    } catch (err) {
      return reply.code(401).send({ error: 'webhook verification failed' });
    }
  };
}

function intFromEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
