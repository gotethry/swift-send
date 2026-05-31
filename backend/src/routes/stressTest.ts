import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

interface StressTestBody {
  concurrency?: number;
  totalTransfers?: number;
  amount?: number;
  userId?: string;
  walletId?: string;
  chaos?: {
    apiDowntimeEvery?: number;
    blockchainLatencyMs?: number;
  };
}

export default async function stressTestRoutes(fastify: FastifyInstance) {
  const adminGuards = {
    preHandler: [requireVerifiedSession, requireRole('admin')],
  };

  fastify.post<{ Body: StressTestBody }>(
    '/admin/stress-test/run',
    adminGuards,
    async (req) => {
      const config = {
        concurrency: Math.min(req.body.concurrency || 10, 100),
        totalTransfers: Math.min(req.body.totalTransfers || 50, 1000),
        amount: req.body.amount || 10,
        userId: req.body.userId || 'user_stress_test',
        walletId: req.body.walletId || 'wallet_stress_test',
        chaos: req.body.chaos,
      };
      return fastify.container.services.stressTest.runStressTest(config);
    },
  );
}
