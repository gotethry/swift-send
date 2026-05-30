import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import type { JwtSessionPayload } from '../auth/sessionTypes';

export default async function thresholdRoutes(fastify: FastifyInstance) {
  const adminGuards = { preHandler: [requireVerifiedSession, requireRole('admin')] };

  fastify.get('/admin/thresholds', adminGuards, async () => {
    return fastify.container.services.approvalThreshold.getRules();
  });

  fastify.get('/admin/thresholds/levels', adminGuards, async () => {
    return fastify.container.services.approvalThreshold.getApprovalLevels();
  });

  fastify.get<{ Params: { id: string } }>(
    '/admin/thresholds/:id',
    adminGuards,
    async (req, reply) => {
      const rule = fastify.container.services.approvalThreshold.getRuleById(req.params.id);
      if (!rule) {
        return reply.code(404).send({ error: 'Threshold rule not found' });
      }
      return rule;
    },
  );

  fastify.post<{
    Body: {
      name: string;
      description: string;
      condition: string;
      config: Record<string, unknown>;
      action: string;
      approvalLevel: number;
      priority: number;
      notifyAdmins: boolean;
    };
  }>(
    '/admin/thresholds',
    adminGuards,
    async (req, reply) => {
      const body = req.body;
      if (!body.name || !body.condition || !body.action) {
        return reply.code(400).send({ error: 'name, condition, and action are required' });
      }
      const payload = req.user as JwtSessionPayload;
      const rule = fastify.container.services.approvalThreshold.createRule({
        name: body.name,
        description: body.description || '',
        condition: body.condition as any,
        config: body.config || {},
        action: body.action as any,
        approvalLevel: body.approvalLevel || 0,
        priority: body.priority || 0,
        notifyAdmins: body.notifyAdmins ?? true,
        createdBy: payload.sub,
      });
      return reply.code(201).send(rule);
    },
  );

  fastify.put<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      description: string;
      condition: string;
      config: Record<string, unknown>;
      action: string;
      approvalLevel: number;
      priority: number;
      notifyAdmins: boolean;
      enabled: boolean;
    }>;
  }>(
    '/admin/thresholds/:id',
    adminGuards,
    async (req, reply) => {
      const updated = fastify.container.services.approvalThreshold.updateRule(req.params.id, req.body as any);
      if (!updated) {
        return reply.code(404).send({ error: 'Threshold rule not found' });
      }
      return updated;
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/admin/thresholds/:id',
    adminGuards,
    async (req, reply) => {
      const deleted = fastify.container.services.approvalThreshold.deleteRule(req.params.id);
      if (!deleted) {
        return reply.code(404).send({ error: 'Threshold rule not found' });
      }
      return { deleted: true };
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/admin/thresholds/:id/toggle',
    adminGuards,
    async (req, reply) => {
      const toggled = fastify.container.services.approvalThreshold.toggleRule(req.params.id);
      if (!toggled) {
        return reply.code(404).send({ error: 'Threshold rule not found' });
      }
      return toggled;
    },
  );
}
