import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import type { JwtSessionPayload } from '../auth/sessionTypes';
import type { SecurityEventLevel } from '../modules/securityEvents/securityEventsService';

const ALLOWED_LEVELS: SecurityEventLevel[] = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'];

export default async function securityEventsRoutes(fastify: FastifyInstance) {
  // ingest events (from services) - authenticated; userId is always the session subject
  fastify.post('/security/events', { preHandler: [requireVerifiedSession] }, async (req, reply) => {
    const body = req.body as any;
    const payload = req.user as JwtSessionPayload;
    const svc = fastify.container.services.securityEvents;
    const level: SecurityEventLevel = ALLOWED_LEVELS.includes(body.level) ? body.level : 'INFO';
    const event = svc.ingestEvent(
      body.type,
      level,
      body.action || 'ingest',
      body.details || {},
      {
        userId: payload.sub,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        sessionId: payload.sub,
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

  fastify.get('/admin/security/events/export', { preHandler: [requireVerifiedSession, requireRole('admin')] }, async (req, reply) => {
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
    return reply.type('text/csv').send(csv);
  });
}
