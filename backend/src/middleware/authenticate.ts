import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JwtSessionPayload } from '../auth/sessionTypes';
import { getSession, saveSession, touchSession } from '../auth/sessionStore';

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify({ onlyCookie: true });
  } catch {
    await reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const payload = request.user as JwtSessionPayload;
  const session = touchSession(payload.sub);
  if (!session) {
    await reply.code(401).send({ error: 'Session expired' });
  }
}

export async function requireVerifiedSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) {
    return;
  }

  const payload = request.user as JwtSessionPayload;
  const session = getSession(payload.sub);
  if (!session) {
    await reply.code(401).send({ error: 'Session expired' });
    return;
  }
  if (!session.verified) {
    await reply.code(403).send({ error: 'Verification required' });
    return;
  }

  // Session anomaly / forced re-authentication gate (step-up)
  // Uses the existing risk engine (new IP/device/rapid attempts/unusual time).
  const userAgent = request.headers['user-agent'];
  const riskAssessment = request.server.container.services.authRiskEngine.assessRisk(
    session.id,
    request.ip,
    typeof userAgent === 'string' ? userAgent : undefined,
  );

  if (riskAssessment.requiresBlock) {
    try {
      await request.server.container.services.notification.notifySecurityEvent({
        userId: session.id,
        kind: 'access_blocked',
        title: 'Suspicious sign-in blocked',
        message: `We blocked access due to suspicious activity. ${riskAssessment.factors.join('; ')}`,
        metadata: {
          riskLevel: riskAssessment.level,
          score: riskAssessment.score,
          factors: riskAssessment.factors,
        },
      });
    } catch {
      // notifications are best-effort
    }
    await reply.code(403).send({
      error: 'Access blocked due to suspicious activity',
      code: 'access_blocked',
      riskAssessment: {
        level: riskAssessment.level,
        score: riskAssessment.score,
        factors: riskAssessment.factors,
        assessedAt: riskAssessment.assessedAt,
      },
    });
    return;
  }

  if (session.reauthRequired || riskAssessment.requiresStepUp) {
    // If the risk engine says we need step-up, persist the reason on the session.
    if (!session.reauthRequired && riskAssessment.requiresStepUp) {
      session.reauthRequired = true;
      session.reauthReason = riskAssessment.factors.some((f) => f.toLowerCase().includes('new ip'))
        ? 'new_ip'
        : riskAssessment.factors.some((f) => f.toLowerCase().includes('unrecognized device'))
          ? 'new_device'
          : 'risk';
      session.reauthFactors = riskAssessment.factors;
      session.reauthAssessedAt = riskAssessment.assessedAt;
      saveSession(session);

      try {
        await request.server.container.services.notification.notifySecurityEvent({
          userId: session.id,
          kind: 'reauth_required',
          title: 'Re-authentication required',
          message: `We detected a session change and need you to verify again. ${riskAssessment.factors.join('; ')}`,
          metadata: {
            riskLevel: riskAssessment.level,
            score: riskAssessment.score,
            factors: riskAssessment.factors,
          },
        });
      } catch {
        // notifications are best-effort
      }
    }

    await reply.code(403).send({
      error: 'Re-authentication required',
      code: 'reauth_required',
      details: {
        reason: session.reauthReason ?? 'risk',
        factors: session.reauthFactors ?? riskAssessment.factors,
        assessedAt: session.reauthAssessedAt ?? riskAssessment.assessedAt,
      },
    });
    return;
  }
}
