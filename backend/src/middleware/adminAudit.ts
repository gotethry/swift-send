import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JwtSessionPayload } from '../auth/sessionTypes';

/**
 * Returns a Fastify preHandler that logs an admin action to the audit trail.
 * Fire-and-log: does not block or delay the request.
 */
export function createAdminAuditHook(action: string) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const payload = request.user as JwtSessionPayload | undefined;
    if (!payload?.sub) return;
    const metadata: Record<string, unknown> = {};
    if (request.body && typeof request.body === 'object') metadata.body = request.body;
    if (request.params && typeof request.params === 'object') metadata.params = request.params;
    request.server.container.services.adminAudit.log(payload.sub, action, request.ip, metadata);
  };
}
