import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import type { JwtSessionPayload } from '../auth/sessionTypes';

export default async function verificationRoutes(fastify: FastifyInstance) {
  const authGuard = { preHandler: [requireVerifiedSession] };
  const adminGuards = { preHandler: [requireVerifiedSession, requireRole('admin')] };

  fastify.get<{ Params: { recipientId: string } }>(
    '/verification/:recipientId',
    authGuard,
    async (req, reply) => {
      const verification = fastify.container.services.verification.getVerification(req.params.recipientId);
      if (!verification) {
        return reply.code(404).send({ error: 'Recipient not found' });
      }
      return verification;
    },
  );

  fastify.get('/verification/badges', authGuard, async () => {
    return fastify.container.services.verification.getBadgeDefinitions();
  });

  fastify.post<{
    Body: {
      recipientId: string;
      recipientName: string;
      recipientPhone: string;
      method: string;
    };
  }>(
    '/verification/request',
    authGuard,
    async (req, reply) => {
      const body = req.body;
      if (!body.recipientId || !body.recipientName || !body.recipientPhone || !body.method) {
        return reply.code(400).send({ error: 'recipientId, recipientName, recipientPhone, and method are required' });
      }
      const request = fastify.container.services.verification.createVerificationRequest({
        recipientId: body.recipientId,
        recipientName: body.recipientName,
        recipientPhone: body.recipientPhone,
        method: body.method as any,
      });
      return reply.code(201).send(request);
    },
  );

  fastify.get('/admin/verifications', adminGuards, async (req) => {
    const query = req.query as { status?: string; limit?: string };
    const limit = Number(query.limit) || 50;
    if (query.status) {
      return fastify.container.services.verification.getVerificationsByStatus(query.status as any, limit);
    }
    return fastify.container.services.verification.getAllVerifications(limit);
  });

  fastify.get('/admin/verifications/requests', adminGuards, async (req) => {
    const query = req.query as { limit?: string };
    const limit = Number(query.limit) || 50;
    return fastify.container.services.verification.getVerificationRequests(limit);
  });

  fastify.get<{ Params: { id: string } }>(
    '/admin/verifications/requests/:id',
    adminGuards,
    async (req, reply) => {
      const request = fastify.container.services.verification.getVerificationRequestById(req.params.id);
      if (!request) {
        return reply.code(404).send({ error: 'Verification request not found' });
      }
      return request;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/admin/verifications/requests/:id/approve',
    adminGuards,
    async (req, reply) => {
      const reviewerId = (req.user as JwtSessionPayload).sub;
      const result = fastify.container.services.verification.approveVerification(req.params.id, reviewerId);
      if (!result) {
        return reply.code(400).send({ error: 'Could not approve verification request' });
      }
      return result;
    },
  );

  fastify.post<{ Params: { id: string }; Body: { reason: string } }>(
    '/admin/verifications/requests/:id/reject',
    adminGuards,
    async (req, reply) => {
      const reviewerId = (req.user as JwtSessionPayload).sub;
      const reason = req.body?.reason || 'Rejected by admin';
      const result = fastify.container.services.verification.rejectVerification(req.params.id, reviewerId, reason);
      if (!result) {
        return reply.code(400).send({ error: 'Could not reject verification request' });
      }
      return result;
    },
  );
}
