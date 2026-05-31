import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import type { JwtSessionPayload } from '../auth/sessionTypes';

interface ApproveBody {
  reason?: string;
}

export default async function approvalRoutes(fastify: FastifyInstance) {
  const adminGuards = { preHandler: [requireVerifiedSession, requireRole('admin')] };

  fastify.get('/admin/approvals', adminGuards, async (req) => {
    const query = req.query as { limit?: string; status?: string };
    const limit = Number(query.limit) || 50;
    const status = query.status;
    const all = fastify.container.services.transactionApproval.listAll(limit);
    if (status) {
      return all.filter((r) => r.status === status);
    }
    return all;
  });

  fastify.get('/admin/approvals/pending', adminGuards, async (req) => {
    const query = req.query as { limit?: string };
    const limit = Number(query.limit) || 20;
    return fastify.container.services.transactionApproval.listPending(limit);
  });

  fastify.get<{ Params: { id: string } }>(
    '/admin/approvals/:id',
    adminGuards,
    async (req, reply) => {
      const request = fastify.container.services.transactionApproval.getRequest(req.params.id);
      if (!request) {
        return reply.code(404).send({ error: 'Approval request not found' });
      }
      return request;
    },
  );

  fastify.get('/admin/approvals/stats', adminGuards, async () => {
    return fastify.container.services.transactionApproval.getStats();
  });

  fastify.post<{ Params: { id: string }; Body: ApproveBody }>(
    '/admin/approvals/:id/approve',
    adminGuards,
    async (req, reply) => {
      const reviewerId = (req.user as JwtSessionPayload).sub;
      try {
        const result = fastify.container.services.transactionApproval.approveRequest(
          req.params.id,
          reviewerId,
        );
        return result;
      } catch (err: any) {
        return reply.code(400).send({
          error: err?.message || 'Failed to approve request',
          code: err?.code,
        });
      }
    },
  );

  fastify.post<{ Params: { id: string }; Body: { reason: string } }>(
    '/admin/approvals/:id/reject',
    adminGuards,
    async (req, reply) => {
      const reviewerId = (req.user as JwtSessionPayload).sub;
      const reason = req.body?.reason || 'Rejected by admin';
      try {
        const result = fastify.container.services.transactionApproval.rejectRequest(
          req.params.id,
          reviewerId,
          reason,
        );
        return result;
      } catch (err: any) {
        return reply.code(400).send({
          error: err?.message || 'Failed to reject request',
          code: err?.code,
        });
      }
    },
  );

  fastify.post<{ Body: { transferId: string; amount: number; currency: string; reason?: string; notes?: string } }>(
    '/approvals/request',
    { preHandler: [requireVerifiedSession] },
    async (req, reply) => {
      const payload = req.user as JwtSessionPayload;
      const body = req.body;
      if (!body.transferId || !body.amount) {
        return reply.code(400).send({ error: 'transferId and amount are required' });
      }
      const approvalReason = fastify.container.services.transactionApproval.requiresApproval(
        body.amount,
      );
      if (!approvalReason) {
        return reply.code(400).send({
          error: 'Transfer does not require approval',
          canProceed: true,
        });
      }
      const request = fastify.container.services.transactionApproval.requestApproval({
        transferId: body.transferId,
        userId: payload.sub,
        amount: body.amount,
        currency: body.currency || 'USDC',
        reason: approvalReason,
        notes: body.notes,
      });
      return reply.code(201).send(request);
    },
  );
}
