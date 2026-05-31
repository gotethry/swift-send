import type { FastifyInstance, FastifyReply } from 'fastify';
import { config, isProd } from '../config';
import type { JwtSessionPayload, PublicUser } from '../auth/sessionTypes';
import {
  createMariaSession,
  createNewUserSession,
  deleteSession,
  getSession,
  getSessionInfo,
  isMariaIdentifier,
  saveSession,
  trustIp,
  updateLastKnownIp,
} from '../auth/sessionStore';
import { authenticate } from '../middleware/authenticate';
import { deleteCachedKey, getCachedJson, setCachedJson } from '../utils/redisCache';
import { verifyRateLimiter, resendRateLimiter } from '../auth/rateLimiter';
import { generateFingerprint } from '../auth/deviceFingerprint';

interface LoginBody {
  identifier: string;
}

interface VerifyBody {
  code: string;
}

interface StepUpVerifyBody {
  code: string;
}

interface OnboardingBody {
  name?: string;
  email?: string;
  phone?: string;
  accountType?: 'personal' | 'business';
  companyName?: string;
  role?: 'owner' | 'finance_admin' | 'operator';
  teamMembers?: Array<{
    name: string;
    email: string;
    role: 'owner' | 'admin' | 'approver' | 'viewer';
    status: 'active' | 'invited';
  }>;
}

function sessionToAuthUser(session: { id: string; email?: string; phone?: string; verified: boolean; hasWallet: boolean; role?: 'admin' | 'user' }) {
  return {
    id: session.id,
    email: session.email,
    phone: session.phone,
    isVerified: session.verified,
    hasWallet: session.hasWallet,
    role: session.role ?? 'user',
  };
}

async function setAuthCookie(reply: FastifyReply, session: { id: string; verified: boolean; hasWallet: boolean; role?: 'admin' | 'user' }) {
  const payload: JwtSessionPayload = {
    sub: session.id,
    verified: session.verified,
    hasWallet: session.hasWallet,
    role: session.role ?? 'user',
  };
  const token = await reply.jwtSign(payload, { expiresIn: config.auth.jwtExpiresSeconds });
  reply.setCookie(config.auth.cookieName, token, {
    path: '/',
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    maxAge: config.auth.jwtExpiresSeconds,
  });
}

function clearAuthCookie(reply: FastifyReply) {
  reply.clearCookie(config.auth.cookieName, {
    path: '/',
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
  });
}

function isValidVerificationCode(code: string): boolean {
  const dev = config.env === 'development' || config.env === 'test';
  if (dev) return code.length === 6 && /^\d{6}$/.test(code);
  return code === '123456';
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: LoginBody }>('/auth/login', async (request, reply) => {
    const identifier = request.body?.identifier?.trim();
    if (!identifier) {
      return reply.status(400).send({ error: 'identifier is required' });
    }

    const isEmail = identifier.includes('@');

    if (isMariaIdentifier(identifier)) {
      const session = createMariaSession();
      await setAuthCookie(reply, session);

      const mariaFingerprint = generateFingerprint(request.headers, request.ip);
      fastify.container.services.authRiskEngine.recordAuthEvent({
        userId: session.id,
        type: 'login',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        fingerprint: mariaFingerprint,
        success: true,
        timestamp: new Date().toISOString(),
      });

      return reply.send({
        needsVerification: false,
        isNewUser: false,
        authUser: sessionToAuthUser(session),
        session: getSessionInfo(session),
        user: session.user ?? null,
      });
    }

    const session = createNewUserSession(isEmail ? identifier.toLowerCase() : undefined, isEmail ? undefined : identifier);
    await setAuthCookie(reply, session);

    const fingerprint = generateFingerprint(request.headers, request.ip);
    const riskAssessment = fastify.container.services.authRiskEngine.assessRisk(
      session.id,
      request.ip,
      request.headers['user-agent'],
      fingerprint,
    );
    fastify.container.services.authRiskEngine.recordAuthEvent({
      userId: session.id,
      type: 'login',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      fingerprint,
      success: true,
      timestamp: new Date().toISOString(),
    });

    return reply.send({
      needsVerification: true,
      isNewUser: true,
      authUser: sessionToAuthUser(session),
      session: getSessionInfo(session),
      user: null,
      riskAssessment: {
        level: riskAssessment.level,
        requiresStepUp: riskAssessment.requiresStepUp,
        deviceUnknown: riskAssessment.factors.includes('Login from unrecognized device'),
        factors: riskAssessment.factors,
      },
    });
  });

  /** Sign-up always creates a fresh unverified session (demo; no password). */
  fastify.post<{ Body: LoginBody }>('/auth/signup', async (request, reply) => {
    const identifier = request.body?.identifier?.trim();
    if (!identifier) {
      return reply.status(400).send({ error: 'identifier is required' });
    }
    const isEmail = identifier.includes('@');
    const session = createNewUserSession(isEmail ? identifier.toLowerCase() : undefined, isEmail ? undefined : identifier);
    await setAuthCookie(reply, session);

    fastify.container.services.authRiskEngine.recordAuthEvent({
      userId: session.id,
      type: 'login',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      fingerprint: generateFingerprint(request.headers, request.ip),
      success: true,
      timestamp: new Date().toISOString(),
    });

    return reply.send({
      needsVerification: true,
      authUser: sessionToAuthUser(session),
      session: getSessionInfo(session),
    });
  });

  fastify.post<{ Body: VerifyBody }>('/auth/verify', { preHandler: [authenticate] }, async (request, reply) => {
    const code = request.body?.code?.trim();
    if (!code) {
      return reply.status(400).send({ error: 'code is required' });
    }

    const token = request.user as JwtSessionPayload;
    const session = getSession(token.sub);
    if (!session) {
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Session expired' });
    }

    if (verifyRateLimiter.isLimited(session.id)) {
      return reply.status(429).send({
        error: 'Account locked due to too many failed attempts',
        lockedSeconds: verifyRateLimiter.getRemainingSeconds(session.id),
      });
    }

    if (!isValidVerificationCode(code)) {
      verifyRateLimiter.recordAttempt(session.id);
      fastify.container.services.authRiskEngine.recordAuthEvent({
        userId: session.id,
        type: 'verify_attempt',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        fingerprint: generateFingerprint(request.headers, request.ip),
        success: false,
        timestamp: new Date().toISOString(),
      });
      const locked = verifyRateLimiter.isLimited(session.id);
      if (locked) {
        return reply.status(429).send({
          error: 'Account locked due to too many failed attempts',
          lockedSeconds: verifyRateLimiter.getRemainingSeconds(session.id),
        });
      }
      return reply.status(400).send({ error: 'Invalid verification code' });
    }

    verifyRateLimiter.reset(session.id);
    fastify.container.services.authRiskEngine.recordAuthEvent({
      userId: session.id,
      type: 'verify',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      fingerprint: generateFingerprint(request.headers, request.ip),
      success: true,
      timestamp: new Date().toISOString(),
    });
    session.verified = true;
    if (!session.hasWallet) {
      session.onboardingCompleted = false;
      session.user = undefined;
    }
    saveSession(session);
    await deleteCachedKey(`auth:me:${session.id}`);

    await setAuthCookie(reply, session);

    return reply.send({
      authUser: sessionToAuthUser(session),
      session: getSessionInfo(session),
      user: session.user ?? null,
      onboardingRequired: session.verified && !session.onboardingCompleted && !session.user,
    });
  });

  /**
   * Step-up verification used for forced re-authentication when session anomaly is detected.
   * For now, this reuses the same OTP-style code logic as /auth/verify.
   */
  fastify.post<{ Body: StepUpVerifyBody }>('/auth/step-up/verify', { preHandler: [authenticate] }, async (request, reply) => {
    const code = request.body?.code?.trim();
    if (!code) {
      return reply.status(400).send({ error: 'code is required' });
    }

    const token = request.user as JwtSessionPayload;
    const session = getSession(token.sub);
    if (!session) {
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Session expired' });
    }

    if (!session.verified) {
      return reply.status(403).send({ error: 'Verification required' });
    }

    if (!isValidVerificationCode(code)) {
      fastify.container.services.authRiskEngine.recordAuthEvent({
        userId: session.id,
        type: 'step_up',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: false,
        timestamp: new Date().toISOString(),
      });
      return reply.status(400).send({ error: 'Invalid verification code' });
    }

    session.reauthRequired = false;
    session.reauthReason = undefined;
    session.reauthFactors = undefined;
    session.reauthAssessedAt = undefined;

    // Trust the current client context.
    updateLastKnownIp(session.id, request.ip);
    trustIp(session.id, request.ip);

    saveSession(session);
    await deleteCachedKey(`auth:me:${session.id}`);
    await setAuthCookie(reply, session);

    fastify.container.services.authRiskEngine.recordAuthEvent({
      userId: session.id,
      type: 'step_up',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      success: true,
      timestamp: new Date().toISOString(),
    });

    try {
      await fastify.container.services.notification.notifySecurityEvent({
        userId: session.id,
        kind: 'step_up_completed',
        title: 'Verification complete',
        message: 'You’re verified and can continue using your account.',
        metadata: { ip: request.ip },
      });
    } catch {
      // best-effort
    }

    return reply.send({
      ok: true,
      authUser: sessionToAuthUser(session),
      session: getSessionInfo(session),
      user: session.user ?? null,
    });
  });

  fastify.post('/auth/verify/unlock', { preHandler: [authenticate] }, async (request, reply) => {
    const token = request.user as JwtSessionPayload;
    const session = getSession(token.sub);
    if (!session) {
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Session expired' });
    }

    verifyRateLimiter.reset(session.id);
    return reply.send({ ok: true, message: 'Verification attempts reset. You may try again.' });
  });

  fastify.post('/auth/resend', { preHandler: [authenticate] }, async (request, reply) => {
    const token = request.user as JwtSessionPayload;
    const session = getSession(token.sub);
    if (!session) {
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Session expired' });
    }

    if (resendRateLimiter.isLimited(session.id)) {
      return reply.status(429).send({
        error: 'Too many resend attempts. Please try again later.',
        lockedSeconds: resendRateLimiter.getRemainingSeconds(session.id),
      });
    }

    resendRateLimiter.recordAttempt(session.id);
    return reply.send({ ok: true, message: 'Verification code resent.' });
  });

  fastify.post('/auth/logout', async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
      const token = request.user as JwtSessionPayload;
      deleteSession(token.sub);
    } catch {
      // still clear cookie for the client
    }
    clearAuthCookie(reply);
    return reply.send({ ok: true });
  });

  fastify.get('/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const token = request.user as JwtSessionPayload;
    const cacheKey = `auth:me:${token.sub}`;
    const cached = await getCachedJson<{
      authUser: ReturnType<typeof sessionToAuthUser>;
      session: ReturnType<typeof getSessionInfo>;
      user: PublicUser | null;
      onboardingRequired: boolean;
    }>(cacheKey);
    if (cached) {
      reply.header('Cache-Control', 'private, max-age=10');
      return reply.send(cached);
    }

    const session = getSession(token.sub);
    if (!session) {
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Session expired' });
    }

    const response = {
      authUser: sessionToAuthUser(session),
      session: getSessionInfo(session),
      user: session.user ?? null,
      onboardingRequired: session.verified && !session.onboardingCompleted && !session.user,
    } as const;

    await setCachedJson(cacheKey, response, config.cache.balanceCacheTtlSeconds);
    reply.header('Cache-Control', 'private, max-age=10');
    return reply.send(response);
  });

  fastify.post('/auth/session/heartbeat', { preHandler: [authenticate] }, async (request, reply) => {
    const token = request.user as JwtSessionPayload;
    const session = getSession(token.sub);
    if (!session) {
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Session expired' });
    }

    return reply.send({
      session: getSessionInfo(session),
      authUser: sessionToAuthUser(session),
    });
  });

  fastify.post<{ Body: OnboardingBody }>('/auth/onboarding/complete', { preHandler: [authenticate] }, async (request, reply) => {
    const token = request.user as JwtSessionPayload;
    const session = getSession(token.sub);
    if (!session) {
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Session expired' });
    }
    if (!session.verified) {
      return reply.status(403).send({ error: 'Verification required' });
    }

    const body = request.body || {};
    const accountType = body.accountType === 'business' ? 'business' : 'personal';
    const businessProfile = accountType === 'business'
      ? {
          companyName: body.companyName || `${body.name || session.user?.name || 'Business'} LLC`,
          role: body.role || 'owner',
          teamSize: body.teamMembers?.length || 1,
          permissions: ['send_transfers', 'view_reports', 'manage_team'],
          teamMembers: body.teamMembers || [
            {
              name: body.name || session.user?.name || 'User',
              email: session.email || body.email || '',
              role: 'owner',
              status: 'active',
            },
          ],
        }
      : undefined;
    const newUser: PublicUser = {
      id: session.id,
      name: body.name || 'User',
      email: session.email || body.email,
      phone: session.phone || body.phone || '',
      balance: 0,
      usdcBalance: 0,
      localCurrency: 'USD',
      exchangeRate: 1.0,
      isVerified: true,
      onboardingCompleted: true,
      walletAddress: `wallet_${session.id}`,
      wallets: [], // Initialize with empty wallets array
      accountType,
      businessProfile,
      createdAt: new Date().toISOString(),
    };

    session.user = newUser;
    session.hasWallet = true;
    session.onboardingCompleted = true;
    saveSession(session);
    await deleteCachedKey(`auth:me:${session.id}`);

    await setAuthCookie(reply, session);

    return reply.send({
      user: newUser,
      authUser: sessionToAuthUser(session),
      session: getSessionInfo(session),
    });
  });

  fastify.post<{
    Body: {
      companyName: string;
      role: 'owner' | 'finance_admin' | 'operator';
      teamMembers: Array<{
        name: string;
        email: string;
        role: 'owner' | 'admin' | 'approver' | 'viewer';
        status: 'active' | 'invited';
      }>;
    };
  }>('/auth/business/profile', { preHandler: [authenticate] }, async (request, reply) => {
    const token = request.user as JwtSessionPayload;
    const session = getSession(token.sub);
    if (!session || !session.user) {
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Session expired' });
    }

    const body = request.body;
    const companyName = body?.companyName?.trim();
    if (!companyName) {
      return reply.status(400).send({ error: 'companyName is required' });
    }

    const teamMembers = Array.isArray(body.teamMembers) && body.teamMembers.length > 0
      ? body.teamMembers
      : [
          {
            name: session.user.name,
            email: session.user.email || '',
            role: 'owner' as const,
            status: 'active' as const,
          },
        ];

    session.user.accountType = 'business';
    session.user.businessProfile = {
      companyName,
      role: body.role || 'owner',
      teamSize: teamMembers.length,
      permissions: ['send_transfers', 'view_reports', 'manage_team'],
      teamMembers,
    };
    saveSession(session);
    await deleteCachedKey(`auth:me:${session.id}`);

    await setAuthCookie(reply, session);

    return reply.send({
      user: session.user,
      authUser: sessionToAuthUser(session),
      session: getSessionInfo(session),
    });
  });
}
