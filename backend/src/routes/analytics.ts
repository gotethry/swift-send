import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  const authGuard = { preHandler: [requireVerifiedSession] };

  fastify.get('/analytics/cash-flow/summary', authGuard, async () => {
    return fastify.container.services.cashFlowAnalytics.getSummary();
  });

  fastify.get('/analytics/cash-flow/monthly', authGuard, async (req) => {
    const query = req.query as { months?: string };
    const months = Number(query.months) || 6;
    return fastify.container.services.cashFlowAnalytics.getMonthlyData(months);
  });

  fastify.get('/analytics/cash-flow/trend', authGuard, async (req) => {
    const query = req.query as { days?: string };
    const days = Number(query.days) || 90;
    return fastify.container.services.cashFlowAnalytics.getTrend(days);
  });

  fastify.get('/analytics/cash-flow/top-recipients', authGuard, async (req) => {
    const query = req.query as { limit?: string };
    const limit = Number(query.limit) || 10;
    return fastify.container.services.cashFlowAnalytics.getTopRecipients(limit);
  });

  fastify.get('/analytics/cash-flow/top-sources', authGuard, async (req) => {
    const query = req.query as { limit?: string };
    const limit = Number(query.limit) || 10;
    return fastify.container.services.cashFlowAnalytics.getTopSources(limit);
  });
}
