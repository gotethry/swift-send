import type { FastifyInstance } from 'fastify';
import { loginRateLimiter, recoveryRateLimiter, resendRateLimiter, verifyRateLimiter } from '../auth/rateLimiter';
import { requireVerifiedSession } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { getSession, saveSession } from '../auth/sessionStore';
import type { JwtSessionPayload } from '../auth/sessionTypes';

interface SetGateBody {
  open: boolean;
}

interface SetAllowBody {
  userId: string;
  allow: boolean;
}

interface SetRoleBody {
  userId: string;
  role: 'admin' | 'user';
}

interface DlqRetryBody {
  jobId: string;
}

interface ApiUsageRouteStat {
  route: string;
  count: number;
  averageLatencyMs: number;
  errorCount: number;
}

export default async function adminRoutes(fastify: FastifyInstance) {
  const adminGuards = { preHandler: [requireVerifiedSession, requireRole('admin')] };

  fastify.get('/admin/fees/analytics', adminGuards, async () => {
    return fastify.container.services.activity.getAdminFeeAnalytics();
  });

  fastify.get('/admin/api-usage', adminGuards, async () => {
    const metrics = fastify.container.services.operationalMetrics.getMetrics();
    const recentSamples = metrics.latency.samples.slice(-100);
    const routeMap = new Map<string, { route: string; count: number; totalLatency: number; errorCount: number }>();

    for (const sample of recentSamples) {
      const existing = routeMap.get(sample.route) || {
        route: sample.route,
        count: 0,
        totalLatency: 0,
        errorCount: 0,
      };
      existing.count += 1;
      existing.totalLatency += sample.latencyMs;
      if (sample.statusCode >= 400) {
        existing.errorCount += 1;
      }
      routeMap.set(sample.route, existing);
    }

    const routeStats: ApiUsageRouteStat[] = Array.from(routeMap.values())
      .map((entry) => ({
        route: entry.route,
        count: entry.count,
        averageLatencyMs: entry.count > 0 ? Math.round(entry.totalLatency / entry.count) : 0,
        errorCount: entry.errorCount,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      requestTracking: {
        totalRequests: metrics.throughput.totalRequests,
        averagePerMinute: metrics.throughput.averagePerMinute,
        currentThroughput: metrics.throughput.current,
        recentSamples: metrics.throughput.samples,
      },
      latency: metrics.latency,
      rateLimits: {
        login: {
          ...loginRateLimiter.getStats(),
          ...loginRateLimiter.getConfig(),
        },
        verify: {
          ...verifyRateLimiter.getStats(),
          ...verifyRateLimiter.getConfig(),
        },
        resend: {
          ...resendRateLimiter.getStats(),
          ...resendRateLimiter.getConfig(),
        },
        recovery: {
          ...recoveryRateLimiter.getStats(),
          ...recoveryRateLimiter.getConfig(),
        },
      },
      routeStats,
    };
  });

  /** GET /admin/rbac/status — view current Access Guard state */
  fastify.get('/admin/rbac/status', adminGuards, async (req) => {
    return fastify.container.services.accessGuard.getStatus();
  });

  /** POST /admin/rbac/gate — open or close the system-wide transfer gate */
  fastify.post<{ Body: SetGateBody }>(
    '/admin/rbac/gate',
    adminGuards,
    async (req, reply) => {
      if (typeof req.body?.open !== 'boolean') {
        return reply.code(400).send({ error: '`open` (boolean) is required' });
      }
      const payload = req.user as JwtSessionPayload;
      fastify.container.services.accessGuard.setGate(req.body.open, payload.sub);
      return { gateOpen: req.body.open };
    },
  );

  /** POST /admin/rbac/allow — explicitly allow or block a user */
  fastify.post<{ Body: SetAllowBody }>(
    '/admin/rbac/allow',
    adminGuards,
    async (req, reply) => {
      const { userId, allow } = req.body ?? {};
      if (!userId || typeof allow !== 'boolean') {
        return reply.code(400).send({ error: '`userId` and `allow` (boolean) are required' });
      }
      const payload = req.user as JwtSessionPayload;
      fastify.container.services.accessGuard.setAllow(userId, allow, payload.sub);
      return { userId, allow };
    },
  );

  /** POST /admin/rbac/role — assign a role to a user */
  fastify.post<{ Body: SetRoleBody }>(
    '/admin/rbac/role',
    adminGuards,
    async (req, reply) => {
      const { userId, role } = req.body ?? {};
      if (!userId || !['admin', 'user'].includes(role)) {
        return reply.code(400).send({ error: '`userId` and `role` (admin|user) are required' });
      }
      const payload = req.user as JwtSessionPayload;
      fastify.container.services.accessGuard.setRole(userId, role, payload.sub);

      // Persist role into the session so it's reflected immediately
      const session = getSession(userId);
      if (session) {
        session.role = role;
        saveSession(session);
      }

      return { userId, role };
    },
  );

  /** Dead Letter Queue Management */

  /** GET /admin/dlq — view all DLQ entries */
  fastify.get('/admin/dlq', adminGuards, async () => {
    return fastify.container.services.deadLetterQueue.getAllEntries();
  });

  /** GET /admin/dlq/stats — DLQ statistics */
  fastify.get('/admin/dlq/stats', adminGuards, async () => {
    return fastify.container.services.deadLetterQueue.getStats();
  });

  /** GET /admin/dlq/:jobId — view single DLQ entry */
  fastify.get<{ Params: { jobId: string } }>(
    '/admin/dlq/:jobId',
    adminGuards,
    async (req, reply) => {
      const entry = fastify.container.services.deadLetterQueue.getEntry(req.params.jobId);
      if (!entry) {
        return reply.code(404).send({ error: 'DLQ entry not found' });
      }
      return entry;
    },
  );

  /** POST /admin/dlq/retry — retry a single DLQ entry */
  fastify.post<{ Body: DlqRetryBody }>(
    '/admin/dlq/retry',
    adminGuards,
    async (req, reply) => {
      const { jobId } = req.body ?? {};
      if (!jobId) {
        return reply.code(400).send({ error: '`jobId` is required' });
      }

      const transfers = fastify.container.services.transfers;
      const entry = await fastify.container.services.deadLetterQueue.retryJob(
        jobId,
        async (command) => transfers.createTransfer(command),
      );

      if (!entry) {
        return reply.code(404).send({ error: 'DLQ entry not found' });
      }

      return entry;
    },
  );

  /** POST /admin/dlq/retry-all — retry all pending DLQ entries */
  fastify.post('/admin/dlq/retry-all', adminGuards, async () => {
    const transfers = fastify.container.services.transfers;
    const result = await fastify.container.services.deadLetterQueue.retryAll(
      async (command) => transfers.createTransfer(command),
    );
    return result;
  });

  /** POST /admin/dlq/:jobId/discard — discard a DLQ entry */
  fastify.post<{ Params: { jobId: string } }>(
    '/admin/dlq/:jobId/discard',
    adminGuards,
    async (req, reply) => {
      const discarded = fastify.container.services.deadLetterQueue.discardEntry(req.params.jobId);
      if (!discarded) {
        return reply.code(404).send({ error: 'DLQ entry not found' });
      }
      return { discarded: true, jobId: req.params.jobId };
    },
  );

  /** POST /admin/dlq/purge — purge all discarded DLQ entries */
  fastify.post('/admin/dlq/purge', adminGuards, async () => {
    const purged = fastify.container.services.deadLetterQueue.purgeDiscarded();
    return { purged };
  });

  /** Settlement Analytics */

  /** GET /admin/settlements/analytics — settlement performance analytics */
  fastify.get('/admin/settlements/analytics', adminGuards, async (req)  => {
    const query = req.query as { days?: string };
    const days = Number(query.days) || 30;
    return fastify.container.services.settlementAnalytics.getAnalytics(days);
  });

  /** GET /admin/settlements/trend — settlement time trend */
  fastify.get('/admin/settlements/trend', adminGuards, async (req) => {
    const query = req.query as { days?: string; bucketDays?: string };
    const days = Number(query.days) || 30;
    const bucketDays = Number(query.bucketDays) || 1;
    return fastify.container.services.settlementAnalytics.getSettlementTimeTrend(days, bucketDays);
  });

  /** GET /admin/settlements/failed — failed transfers list */
  fastify.get('/admin/settlements/failed', adminGuards, async (req) => {
    const query = req.query as { days?: string; limit?: string };
    const days = Number(query.days) || 7;
    const limit = Number(query.limit) || 50;
    return fastify.container.services.settlementAnalytics.getFailedTransfers(days, limit);
  });

  /** Stellar Monitor */

  /** GET /admin/stellar/monitor — stellar monitor state */
  fastify.get('/admin/stellar/monitor', adminGuards, async () => {
    return fastify.container.services.stellarMonitor.getState();
  });

  /** Auth Risk Suspicious Activity */

  /** GET /admin/auth/suspicious — suspicious auth activity */
  fastify.get('/admin/auth/suspicious', adminGuards, async (req) => {
    const query = req.query as { limit?: string };
    const limit = Number(query.limit) || 50;
    return fastify.container.services.authRiskEngine.getSuspiciousActivity(limit);
  });

  /** Admin Alerts */

  /** GET /admin/alerts — list admin alerts */
  fastify.get<{ Querystring: { limit?: string; severity?: string } }>(
    '/admin/alerts',
    adminGuards,
    async (req) => {
      const query = req.query;
      const limit = Number(query.limit) || 50;
      const severity = query.severity as 'critical' | 'high' | 'medium' | 'low' | undefined;
      return fastify.container.services.adminAlerts.getAlerts(limit, severity);
    },
  );

  /** GET /admin/alerts/stats — alert statistics */
  fastify.get('/admin/alerts/stats', adminGuards, async () => {
    return fastify.container.services.adminAlerts.getAlertStats();
  });

  /** POST /admin/alerts/:alertId/acknowledge — acknowledge an alert */
  fastify.post<{ Params: { alertId: string } }>(
    '/admin/alerts/:alertId/acknowledge',
    adminGuards,
    async (req, reply) => {
      const payload = req.user as JwtSessionPayload;
      const alert = fastify.container.services.adminAlerts.acknowledgeAlert(req.params.alertId, payload.sub);
      if (!alert) {
        return reply.code(404).send({ error: 'Alert not found' });
      }
      return alert;
    },
  );

  /** GET /admin/alerts/transfer/:transferId — alerts by transfer */
  fastify.get<{ Params: { transferId: string } }>(
    '/admin/alerts/transfer/:transferId',
    adminGuards,
    async (req) => {
      return fastify.container.services.adminAlerts.getAlertsByTransferId(req.params.transferId);
    },
  );

  /** Fraud Review Queue */
  fastify.get('/admin/fraud/reviews', adminGuards, async () => {
    return fastify.container.services.fraudReview.listPendingReviews();
  });

  fastify.get('/admin/fraud/reviews/logs', adminGuards, async (req) => {
    const query = req.query as { limit?: string };
    const limit = Number(query.limit) || 50;
    return fastify.container.services.fraudReview.listReviewLogs(limit);
  });

  fastify.post<{ Params: { transferId: string } }>(
    '/admin/fraud/reviews/:transferId/approve',
    adminGuards,
    async (req, reply) => {
      const reviewerId = (req.user as JwtSessionPayload).sub;
      const transfer = await fastify.container.services.transfers.approveReview(req.params.transferId, reviewerId);
      return { transferId: transfer.id, status: transfer.state };
    },
  );

  fastify.post<{ Params: { transferId: string }; Body: { reason?: string } }>(
    '/admin/fraud/reviews/:transferId/reject',
    adminGuards,
    async (req, reply) => {
      const reviewerId = (req.user as JwtSessionPayload).sub;
      const reason = req.body?.reason;
      const transfer = await fastify.container.services.transfers.rejectReview(req.params.transferId, reviewerId, reason);
      return { transferId: transfer.id, status: transfer.state, rejectedReason: reason || 'manual rejection' };
    },
  );

  /** Transfer Retry State */

  /** GET /admin/transfers/retry-history — transfers with retry info */
  fastify.get('/admin/transfers/retry-history', adminGuards, async (req) => {
    const query = req.query as { limit?: string };
    const limit = Number(query.limit) || 50;
    const all = await fastify.container.services.transfers.listAll();
    const withRetries = all
      .filter((t) => t.processingAttempts > 0 || t.lastError)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit)
      .map((t) => ({
        id: t.id,
        userId: t.userId,
        amount: t.amount,
        currency: t.currency,
        state: t.state,
        processingAttempts: t.processingAttempts,
        lastError: t.lastError,
        statusHistory: t.statusHistory,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
    return withRetries;
  });

  /** Operational Metrics */

  /** GET /admin/metrics — operational metrics */
  fastify.get('/admin/metrics', adminGuards, async () => {
    return fastify.container.services.operationalMetrics.getMetrics();
  });

  /** POST /admin/metrics/record — record an API latency sample */
  fastify.post<{ Body: { route: string; latencyMs: number; statusCode: number } }>(
    '/admin/metrics/record',
    { preHandler: [requireVerifiedSession] },
    async (req) => {
      const { route, latencyMs, statusCode } = req.body ?? {};
      if (!route || typeof latencyMs !== 'number' || typeof statusCode !== 'number') {
        return;
      }
      fastify.container.services.operationalMetrics.recordLatency(route, latencyMs, statusCode);
      return { recorded: true };
    },
  );
}
