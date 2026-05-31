import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export default async function successRateRoutes(fastify: FastifyInstance) {
  const adminGuards = { preHandler: [requireVerifiedSession, requireRole('admin')] };

  fastify.get('/admin/success-rate', adminGuards, async (req) => {
    const query = req.query as { days?: string };
    const days = Number(query.days) || 30;
    return fastify.container.services.successRate.getMetrics(days);
  });

  fastify.get('/admin/success-rate/daily-report', adminGuards, async (req) => {
    const query = req.query as { date?: string };
    return fastify.container.services.successRate.getDailyReport(query.date);
  });
}
