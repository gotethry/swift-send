import { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { cleanupExpiredEscrows, listExpiringEscrows } from '../services/escrow';

interface EscrowOverrideBody {
  destination_account?: string;
  reason?: string;
}

interface EscrowReviewQuery {
  hours?: string;
}

export default async function escrowRoutes(fastify: FastifyInstance) {
  const adminGuards = { preHandler: [requireVerifiedSession, requireRole('admin')] };

  fastify.get('/escrow/:transferId', { preHandler: [requireVerifiedSession] }, async (req, reply) => {
    const transferId = (req.params as { transferId: string }).transferId;
    const escrow = await fastify.container.services.wallets.getEscrow(transferId);
    if (!escrow) {
      return reply.status(404).send({ error: `Escrow not found for transfer '${transferId}'` });
    }
    return escrow;
  });

  fastify.post('/escrow/:transferId/release', { preHandler: [requireVerifiedSession] }, async (req, reply) => {
    const transferId = (req.params as { transferId: string }).transferId;
    const escrow = await fastify.container.services.wallets.getEscrow(transferId);
    if (!escrow) {
      return reply.status(404).send({ error: `Escrow not found for transfer '${transferId}'` });
    }

    const body = (req.body as EscrowOverrideBody) || {};
    const destination = body.destination_account || `recipient:${transferId}`;

    try {
      await fastify.container.services.wallets.settleEscrow({
        transferId,
        destinationAccount: destination,
        amount: escrow.amount,
        currency: escrow.currency,
        metadata: { reason: 'manual_release' },
      });
      void fastify.container.services.notification.notifyEscrowReleased({
        userId: (req.user as any)?.sub || 'unknown',
        transferId,
        amount: escrow.amount,
        currency: escrow.currency,
        destinationAccount: destination,
      });
      return { ...escrow, status: 'released', destination };
    } catch (err: any) {
      const statusCode = err?.statusCode || (err?.code === 'escrow_already_finalized' ? 409 : 500);
      return reply.status(statusCode).send({ error: err?.message || 'Release failed', code: err?.code });
    }
  });

  fastify.post('/escrow/:transferId/refund', { preHandler: [requireVerifiedSession] }, async (req, reply) => {
    const transferId = (req.params as { transferId: string }).transferId;
    const escrow = await fastify.container.services.wallets.getEscrow(transferId);
    if (!escrow) {
      return reply.status(404).send({ error: `Escrow not found for transfer '${transferId}'` });
    }

    const body = (req.body as EscrowOverrideBody) || {};

    try {
      await fastify.container.services.wallets.refundEscrow({
        transferId,
        destinationAccount: `wallet:${transferId}`,
        amount: escrow.amount,
        currency: escrow.currency,
        metadata: { reason: body.reason || 'manual_refund' },
      });
      void fastify.container.services.notification.notifyEscrowRefunded({
        userId: (req.user as any)?.sub || 'unknown',
        transferId,
        amount: escrow.amount,
        currency: escrow.currency,
        reason: body.reason,
      });
      return { ...escrow, status: 'refunded', reason: body.reason };
    } catch (err: any) {
      const statusCode = err?.statusCode || (err?.code === 'escrow_already_finalized' ? 409 : 500);
      return reply.status(statusCode).send({ error: err?.message || 'Refund failed', code: err?.code });
    }
  });

  fastify.post('/escrow/:transferId/dispute', { preHandler: [requireVerifiedSession] }, async (req, reply) => {
    const transferId = (req.params as { transferId: string }).transferId;
    const escrow = await fastify.container.services.wallets.getEscrow(transferId);
    if (!escrow) {
      return reply.status(404).send({ error: `Escrow not found for transfer '${transferId}'` });
    }

    const body = (req.body as EscrowOverrideBody) || {};

    try {
      const updated = await fastify.container.services.wallets.disputeEscrow(transferId, body.reason);
      void fastify.container.services.notification.notifyEscrowDisputed({
        userId: (req.user as any)?.sub || 'unknown',
        transferId,
        amount: updated?.amount || 0,
        currency: updated?.currency || 'USDC',
        reason: body.reason,
      });
      return { ...updated, message: 'Escrow marked as disputed. Funds are frozen pending resolution.' };
    } catch (err: any) {
      const statusCode = err?.statusCode || (err?.code === 'escrow_already_finalized' ? 409 : 500);
      return reply.status(statusCode).send({ error: err?.message || 'Dispute failed', code: err?.code });
    }
  });

  fastify.get<{ Querystring: EscrowReviewQuery }>(
    '/admin/escrow/expiring',
    adminGuards,
    async (req) => {
      const hours = Number(req.query.hours || 24);
      return listExpiringEscrows(hours);
    },
  );

  fastify.post('/admin/escrow/cleanup-expired', adminGuards, async () => {
    const expiredEscrows = await cleanupExpiredEscrows();
    await Promise.all(
      expiredEscrows
        .filter((escrow) => escrow.userId)
        .map((escrow) =>
          fastify.container.services.notification.notifyEscrowExpired({
            userId: escrow.userId as string,
            transferId: escrow.transferId,
            amount: escrow.amount,
            currency: escrow.currency,
          }),
        ),
    );

    return {
      success: true,
      expiredCount: expiredEscrows.length,
      items: expiredEscrows,
    };
  });
}
