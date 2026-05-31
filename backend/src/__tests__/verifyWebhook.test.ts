import fastify from 'fastify';
import { verifyWebhook } from '../middleware/verifyWebhook';
import { createHmac } from 'crypto';

describe('verifyWebhook middleware', () => {
  it('accepts valid signature and timestamp', async () => {
    const app = fastify();
    const secret = 'testsecret';
    const mw = verifyWebhook({ secret, toleratedWindowSeconds: 300 });
    app.post('/hook', { preHandler: mw }, async (req, reply) => {
      return { ok: true };
    });

    const payload = { a: 1 };
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    const res = await app.inject({
      method: 'POST',
      url: '/hook',
      payload,
      headers: {
        'x-webhook-timestamp': ts,
        'x-webhook-signature': `sha256=${sig}`,
      },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('rejects invalid signature', async () => {
    const app = fastify();
    const secret = 'testsecret';
    const mw = verifyWebhook({ secret, toleratedWindowSeconds: 300 });
    app.post('/hook', { preHandler: mw }, async (req, reply) => {
      return { ok: true };
    });

    const payload = { a: 1 };
    const ts = Math.floor(Date.now() / 1000).toString();
    const res = await app.inject({
      method: 'POST',
      url: '/hook',
      payload,
      headers: {
        'x-webhook-timestamp': ts,
        'x-webhook-signature': `sha256=deadbeef`,
      },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
