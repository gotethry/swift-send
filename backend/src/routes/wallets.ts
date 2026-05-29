import type { FastifyInstance } from 'fastify';
import { requireVerifiedSession } from '../middleware/authenticate';
import type { JwtSessionPayload, PublicUser } from '../auth/sessionTypes';
import { getSession, saveSession } from '../auth/sessionStore';
import { ValidationError } from '../errors';
import { recoveryRateLimiter } from '../auth/rateLimiter';
import {
  listLinkedWallets,
  removeLinkedWallet,
  setPrimaryLinkedWallet,
  upsertLinkedWallet,
  type LinkedWalletRecord,
} from '../modules/wallets/linkedWalletStore';
import { WalletRecoveryService } from '../modules/wallets/walletRecoveryService';

type VerifiedUserSession = { id: string; user: PublicUser };

function requireUser(payload: JwtSessionPayload): VerifiedUserSession {
  const session = getSession(payload.sub);
  if (!session) throw new ValidationError('Session expired');
  if (!session.user) throw new ValidationError('Onboarding incomplete');
  return { id: session.id, user: session.user };
}

interface LinkWalletBody {
  wallet: LinkedWalletRecord;
}

interface UnlinkWalletBody {
  walletId: string;
}

interface SetPrimaryBody {
  walletId: string;
}

interface CreateRecoveryBody {
  guardianIdentifier: string;
  currentWalletId?: string;
  recoveryWallet: {
    publicKey: string;
    provider: string;
    label?: string;
  };
  reason?: string;
}

interface ApproveRecoveryBody {
  guardianIdentifier: string;
  approvalCode: string;
  note?: string;
}

const walletRecoveryService = new WalletRecoveryService();

export default async function walletRoutes(fastify: FastifyInstance) {
  fastify.get('/wallets/linked', { preHandler: [requireVerifiedSession] }, async (req) => {
    const payload = req.user as JwtSessionPayload;
    const { user } = requireUser(payload);
    return { items: listLinkedWallets(user) };
  });

  fastify.post<{ Body: LinkWalletBody }>(
    '/wallets/linked',
    { preHandler: [requireVerifiedSession] },
    async (req, reply) => {
      const payload = req.user as JwtSessionPayload;
      const session = getSession(payload.sub);
      if (!session?.user) throw new ValidationError('Onboarding incomplete');

      const wallet = req.body?.wallet;
      if (!wallet?.id || !wallet.publicKey || !wallet.provider) {
        return reply.code(400).send({ error: 'wallet.id, wallet.publicKey, wallet.provider are required' });
      }

      const next = upsertLinkedWallet(session.user, wallet);
      session.user.wallets = next;
      saveSession(session);
      return { items: next };
    },
  );

  fastify.delete<{ Body: UnlinkWalletBody }>(
    '/wallets/linked',
    { preHandler: [requireVerifiedSession] },
    async (req, reply) => {
      const payload = req.user as JwtSessionPayload;
      const session = getSession(payload.sub);
      if (!session?.user) throw new ValidationError('Onboarding incomplete');

      const walletId = req.body?.walletId;
      if (!walletId) return reply.code(400).send({ error: 'walletId is required' });

      const next = removeLinkedWallet(session.user, walletId);
      session.user.wallets = next;
      saveSession(session);
      return { items: next };
    },
  );

  fastify.post<{ Body: SetPrimaryBody }>(
    '/wallets/linked/primary',
    { preHandler: [requireVerifiedSession] },
    async (req, reply) => {
      const payload = req.user as JwtSessionPayload;
      const session = getSession(payload.sub);
      if (!session?.user) throw new ValidationError('Onboarding incomplete');

      const walletId = req.body?.walletId;
      if (!walletId) return reply.code(400).send({ error: 'walletId is required' });

      const next = setPrimaryLinkedWallet(session.user, walletId);
      session.user.wallets = next;
      saveSession(session);
      return { items: next };
    },
  );

  /**
   * Wallet Recovery Restore (MVP)
   * Requires the existing step-up verification flag to be cleared (enforced by middleware),
   * and rate-limits restore attempts to prevent abuse.
   */
  fastify.post('/wallets/recovery/restore', { preHandler: [requireVerifiedSession] }, async (req, reply) => {
    const payload = req.user as JwtSessionPayload;
    const session = getSession(payload.sub);
    if (!session?.user) throw new ValidationError('Onboarding incomplete');

    const key = `restore:${session.id}:${req.ip}`;
    if (recoveryRateLimiter.isLimited(key)) {
      return reply.code(429).send({
        error: 'Too many recovery attempts. Please try again later.',
        lockedSeconds: recoveryRateLimiter.getRemainingSeconds(key),
      });
    }
    recoveryRateLimiter.recordAttempt(key);

    const items = listLinkedWallets(session.user);
    session.user.wallets = items;
    saveSession(session);

    return { restored: true, items };
  });

  fastify.post<{ Body: CreateRecoveryBody }>(
    '/wallets/recovery/requests',
    { preHandler: [requireVerifiedSession] },
    async (req, reply) => {
      const payload = req.user as JwtSessionPayload;
      const session = getSession(payload.sub);
      if (!session?.user) throw new ValidationError('Onboarding incomplete');

      const key = `recovery-request:${session.id}:${req.ip}`;
      if (recoveryRateLimiter.isLimited(key)) {
        return reply.code(429).send({
          error: 'Too many recovery requests. Please try again later.',
          lockedSeconds: recoveryRateLimiter.getRemainingSeconds(key),
        });
      }

      const body = req.body;
      if (!body?.guardianIdentifier || !body.recoveryWallet?.publicKey || !body.recoveryWallet?.provider) {
        return reply.code(400).send({
          error: 'guardianIdentifier, recoveryWallet.publicKey, and recoveryWallet.provider are required',
        });
      }

      recoveryRateLimiter.recordAttempt(key);
      const request = walletRecoveryService.createRequest({
        userId: session.user.id,
        userIdentifier: session.user.email || session.user.phone || session.user.id,
        guardianIdentifier: body.guardianIdentifier,
        currentWalletId: body.currentWalletId,
        recoveryWallet: {
          publicKey: body.recoveryWallet.publicKey,
          provider: body.recoveryWallet.provider,
          label: body.recoveryWallet.label || 'Recovered wallet',
        },
        reason: body.reason,
      });

      return reply.code(201).send({ request });
    },
  );

  fastify.get('/wallets/recovery/requests', { preHandler: [requireVerifiedSession] }, async (req) => {
    const payload = req.user as JwtSessionPayload;
    const { user } = requireUser(payload);
    return { items: walletRecoveryService.listRequests(user.id) };
  });

  fastify.post<{ Params: { requestId: string }; Body: ApproveRecoveryBody }>(
    '/wallets/recovery/requests/:requestId/approve',
    { preHandler: [requireVerifiedSession] },
    async (req) => {
      const request = walletRecoveryService.approveRequest(req.params.requestId, {
        guardianIdentifier: req.body?.guardianIdentifier || '',
        approvalCode: req.body?.approvalCode || '',
        note: req.body?.note,
      });
      return { request };
    },
  );

  fastify.post<{ Params: { requestId: string } }>(
    '/wallets/recovery/requests/:requestId/complete',
    { preHandler: [requireVerifiedSession] },
    async (req) => {
      const payload = req.user as JwtSessionPayload;
      const session = getSession(payload.sub);
      if (!session?.user) throw new ValidationError('Onboarding incomplete');

      const request = walletRecoveryService.completeRequest(
        req.params.requestId,
        session.user.email || session.user.phone || session.user.id,
      );
      const next = upsertLinkedWallet(session.user, {
        ...request.recoveryWallet,
        isPrimary: true,
        linkedAt: request.recoveryWallet.linkedAt,
      });
      session.user.wallets = next;
      saveSession(session);

      return { request, wallets: next };
    },
  );

  fastify.get<{ Querystring: { limit?: string } }>(
    '/wallets/recovery/audit',
    { preHandler: [requireVerifiedSession] },
    async (req) => {
      const payload = req.user as JwtSessionPayload;
      const { user } = requireUser(payload);
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      return { items: walletRecoveryService.listAuditLogs(user.id, limit) };
    },
  );
}
