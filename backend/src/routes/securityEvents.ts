import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

export default async function securityEventsRoutes(fastify: FastifyInstance) {
  // ingest events (from services) - authenticated
  fastify.post('/security/events', { preHandler: [requireVerifiedSession] }, async (req, reply) => {
    const body = req.body as any;
    const svc = fastify.container.services.securityEvents;
    const event = svc.ingestEvent(
      body.type,
      (body.level as any) || 'INFO',
      body.action || 'ingest',
      body.details || {},
      {
        userId: body.userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        sessionId: (req.user as any)?.sub,
      },
    );
    return { ingested: true, id: event.id };
  });

  // admin listing
  fastify.get('/admin/security/events', { preHandler: [requireVerifiedSession, requireRole('admin')] }, async (req) => {
    const q = req.query as { type?: string; userId?: string; startTime?: string; endTime?: string; limit?: string; offset?: string };
    const filter: any = {};
    if (q.type) filter.type = q.type;
    if (q.userId) filter.userId = q.userId;
    if (q.startTime) filter.startTime = Number(q.startTime);
    if (q.endTime) filter.endTime = Number(q.endTime);
    const limit = q.limit ? Number(q.limit) : 100;
    return fastify.container.services.securityEvents.queryEvents(filter, limit);
  });

  fastify.get('/admin/security/events/export', { preHandler: [requireVerifiedSession, requireRole('admin')] }, async (req) => {
    const q = req.query as { type?: string; userId?: string; startTime?: string; endTime?: string };
    const filter: any = {};
    if (q.type) filter.type = q.type;
    if (q.userId) filter.userId = q.userId;
    if (q.startTime) filter.startTime = Number(q.startTime);
    if (q.endTime) filter.endTime = Number(q.endTime);
    const events = fastify.container.services.securityEvents.queryEvents(filter, 1000);
    const header = 'id,timestamp,level,type,userId,ipAddress,userAgent,action,details';
    const rows = events.map((e: any) => [e.id, e.timestamp, e.level, e.type, e.userId || '', e.ipAddress || '', JSON.stringify(e.userAgent || ''), e.action, JSON.stringify(e.details || {})].join(','));
    const csv = [header, ...rows].join('\n');
    return fastify.type('text/csv').send(csv);
  });
}
