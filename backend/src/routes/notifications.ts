import type { FastifyInstance } from "fastify";
import { requireVerifiedSession } from "../middleware/authenticate";
import type { JwtSessionPayload } from "../auth/sessionTypes";

interface NotificationsQuery {
  limit?: string;
  compact?: string;
}

export default async function notificationRoutes(fastify: FastifyInstance) {
  const authGuards = { preHandler: [requireVerifiedSession] };

  /** GET /notifications — list user's notifications */
  fastify.get<{ Querystring: NotificationsQuery }>(
    "/notifications",
    authGuards,
    async (req) => {
      const payload = req.user as JwtSessionPayload;
      const headerCompact = req.headers['x-low-bandwidth'] === '1';
      const queryCompact = req.query.compact === '1' || req.query.compact === 'true';
      const compact = headerCompact || queryCompact;
      const fallbackLimit = compact ? 10 : 20;
      const hardMax = compact ? 25 : 100;
      const limit = Math.min(hardMax, Math.max(1, Number(req.query.limit || fallbackLimit)));
      return fastify.container.services.notification.listByUserId(payload.sub, limit);
    },
  );

  /** POST /notifications/:id/read — mark notification as read */
  fastify.post<{ Params: { id: string } }>(
    "/notifications/:id/read",
    authGuards,
    async (req, reply) => {
      const payload = req.user as JwtSessionPayload;
      const notification = fastify.container.services.notification.markAsRead(
        payload.sub,
        req.params.id,
      );
      if (!notification) {
        return reply.code(404).send({ error: "Notification not found" });
      }
      return notification;
    },
  );

  /** POST /notifications/mark-all-read — mark all notifications as read */
  fastify.post("/notifications/mark-all-read", authGuards, async (req) => {
    const payload = req.user as JwtSessionPayload;
    const { items } = fastify.container.services.notification.listByUserId(
      payload.sub,
      1000,
    );
    items.forEach((notification) => {
      if (!notification.readAt) {
        fastify.container.services.notification.markAsRead(
          payload.sub,
          notification.id,
        );
      }
    });
    return {
      success: true,
      markedCount: items.filter((n) => !n.readAt).length,
    };
  });
}
