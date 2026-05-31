import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export default async function traceRoutes(fastify: FastifyInstance) {
  const adminGuards = { preHandler: [requireVerifiedSession, requireRole('admin')] };

  fastify.get('/admin/traces', adminGuards, async (req) => {
    const query = req.query as {
      correlationId?: string;
      method?: string;
      status?: string;
      statusCode?: string;
      userId?: string;
      path?: string;
      startDate?: string;
      endDate?: string;
      limit?: string;
      offset?: string;
    };

    return fastify.container.services.requestTrace.getTraces({
      correlationId: query.correlationId,
      method: query.method as any,
      status: query.status as any,
      statusCode: query.statusCode ? Number(query.statusCode) : undefined,
      userId: query.userId,
      path: query.path,
      startDate: query.startDate,
      endDate: query.endDate,
      limit: query.limit ? Number(query.limit) : 50,
      offset: query.offset ? Number(query.offset) : 0,
    });
  });

  fastify.get('/admin/traces/stats', adminGuards, async () => {
    return fastify.container.services.requestTrace.getStats();
  });

  fastify.get<{ Params: { id: string } }>(
    '/admin/traces/:id',
    adminGuards,
    async (req, reply) => {
      const trace = fastify.container.services.requestTrace.getTraceById(req.params.id);
      if (!trace) {
        return reply.code(404).send({ error: 'Trace not found' });
      }
      return trace;
    },
  );
}
