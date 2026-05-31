import { createLogger } from '../logger';
import type { EventBus } from '../core/eventBus';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AuthRiskFactors {
  failedAttemptsRecent: number;
  isUnusualTime: boolean;
  isNewIp: boolean;
  isNewDevice: boolean;
  rapidAttempts: boolean;
  unusualGeo: boolean;
  timeSinceLastLogin: number;
}

export interface AuthRiskAssessment {
  level: RiskLevel;
  score: number;
  factors: string[];
  requiresStepUp: boolean;
  requiresBlock: boolean;
  assessedAt: string;
}

export interface AuthEvent {
  userId: string;
  type: 'login' | 'verify' | 'verify_attempt' | 'step_up';
  ipAddress?: string;
  userAgent?: string;
  /** SHA-256 device fingerprint generated from request headers + IP */
  fingerprint?: string;
  success: boolean;
  timestamp: string;
}

export interface SuspiciousActivityEntry {
  id: string;
  userId: string;
  riskLevel: RiskLevel;
  score: number;
  factors: string[];
  ipAddress?: string;
  userAgent?: string;
  detectedAt: string;
  resolved: boolean;
}

export class AuthRiskEngine {
  private static readonly HIGH_RISK_THRESHOLD = 70;
  private static readonly CRITICAL_RISK_THRESHOLD = 90;
  private static readonly STEP_UP_THRESHOLD = 40;
  private static readonly RAPID_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
  private static readonly RAPID_ATTEMPT_COUNT = 5;
  private static readonly UNUSUAL_HOUR_START = 0;
  private static readonly UNUSUAL_HOUR_END = 6;

  private authEvents = new Map<string, AuthEvent[]>();
  private knownIps = new Map<string, Set<string>>();
  // TODO: persist knownDevices to DB when DB layer is wired (in-memory resets on restart)
  private knownDevices = new Map<string, Set<string>>();
  private suspiciousActivity: SuspiciousActivityEntry[] = [];
  private failedAttempts = new Map<string, number[]>();

  constructor(private readonly eventBus?: EventBus) {}

  recordAuthEvent(event: AuthEvent): void {
    const userId = event.userId;

    const events = this.authEvents.get(userId) || [];
    events.push(event);
    if (events.length > 100) events.shift();
    this.authEvents.set(userId, events);

    if (event.type === 'login' || event.type === 'verify_attempt') {
      if (event.success) {
        this.failedAttempts.delete(userId);

        if (event.ipAddress) {
          const ips = this.knownIps.get(userId) || new Set();
          ips.add(event.ipAddress);
          this.knownIps.set(userId, ips);
        }

        if (event.fingerprint) {
          this.registerFingerprint(userId, event.fingerprint);
        } else if (event.userAgent) {
          // Fallback to raw user-agent when fingerprint is unavailable
          const devices = this.knownDevices.get(userId) || new Set();
          devices.add(event.userAgent);
          this.knownDevices.set(userId, devices);
        }
      } else {
        const attempts = this.failedAttempts.get(userId) || [];
        attempts.push(Date.now());
        if (attempts.length > 50) attempts.shift();
        this.failedAttempts.set(userId, attempts);
      }
    }
  }

  assessRisk(userId: string, ipAddress?: string, userAgent?: string, fingerprint?: string): AuthRiskAssessment {
    const factors = this.collectRiskFactors(userId, ipAddress, userAgent, fingerprint);
    const score = this.calculateRiskScore(factors);
    const level = this.scoreToLevel(score);

    const assessment: AuthRiskAssessment = {
      level,
      score,
      factors: this.factorsToList(factors),
      requiresStepUp: score >= AuthRiskEngine.STEP_UP_THRESHOLD,
      requiresBlock: score >= AuthRiskEngine.CRITICAL_RISK_THRESHOLD,
      assessedAt: new Date().toISOString(),
    };

    if (level === 'high' || level === 'critical') {
      this.logSuspiciousActivity(userId, assessment, ipAddress, userAgent);
    }

    return assessment;
  }

  getRecentEvents(userId: string, limit = 20): AuthEvent[] {
    return (this.authEvents.get(userId) || [])
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  getSuspiciousActivity(limit = 50): SuspiciousActivityEntry[] {
    return [...this.suspiciousActivity]
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .slice(0, limit);
  }

  registerFingerprint(userId: string, fingerprint: string): void {
    const devices = this.knownDevices.get(userId) || new Set();
    devices.add(fingerprint);
    this.knownDevices.set(userId, devices);
  }

  getFailedAttempts(userId: string): number {
    const attempts = this.failedAttempts.get(userId) || [];
    const windowStart = Date.now() - AuthRiskEngine.RAPID_ATTEMPT_WINDOW_MS;
    const recent = attempts.filter((ts) => ts >= windowStart);
    this.failedAttempts.set(userId, recent);
    return recent.length;
  }

  private collectRiskFactors(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    fingerprint?: string,
  ): AuthRiskFactors {
    const now = Date.now();
    const hour = new Date().getHours();

    const failedAttempts = this.failedAttempts.get(userId) || [];
    const windowStart = now - AuthRiskEngine.RAPID_ATTEMPT_WINDOW_MS;
    const recentFailedAttempts = failedAttempts.filter((ts) => ts >= windowStart);
    this.failedAttempts.set(userId, recentFailedAttempts);

    const knownUserIps = this.knownIps.get(userId) || new Set();
    const knownUserDevices = this.knownDevices.get(userId) || new Set();

    const events = this.authEvents.get(userId) || [];
    const lastSuccessfulLogin = events
      .filter((e) => e.type === 'login' && e.success)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    const recentEvents = events.filter(
      (e) => new Date(e.timestamp).getTime() >= now - AuthRiskEngine.RAPID_ATTEMPT_WINDOW_MS,
    );

    // Use fingerprint for device detection when available; fall back to raw user-agent
    const deviceIdentifier = fingerprint ?? userAgent;
    const isNewDevice =
      !!deviceIdentifier && knownUserDevices.size > 0 && !knownUserDevices.has(deviceIdentifier);

    return {
      failedAttemptsRecent: recentFailedAttempts.length,
      isUnusualTime: hour >= AuthRiskEngine.UNUSUAL_HOUR_START && hour < AuthRiskEngine.UNUSUAL_HOUR_END,
      isNewIp: !!ipAddress && knownUserIps.size > 0 && !knownUserIps.has(ipAddress),
      isNewDevice,
      rapidAttempts: recentEvents.filter((e) => !e.success).length >= AuthRiskEngine.RAPID_ATTEMPT_COUNT,
      unusualGeo: false,
      timeSinceLastLogin: lastSuccessfulLogin
        ? now - new Date(lastSuccessfulLogin.timestamp).getTime()
        : Infinity,
    };
  }

  private calculateRiskScore(factors: AuthRiskFactors): number {
    let score = 0;

    if (factors.failedAttemptsRecent >= 1) score += 10;
    if (factors.failedAttemptsRecent >= 3) score += 15;
    if (factors.failedAttemptsRecent >= 5) score += 20;

    if (factors.isUnusualTime) score += 15;
    if (factors.isNewIp) score += 20;
    if (factors.isNewDevice) score += 15;
    if (factors.rapidAttempts) score += 25;

    if (factors.timeSinceLastLogin === Infinity) score += 5;
    else if (factors.timeSinceLastLogin > 30 * 24 * 60 * 60 * 1000) score += 10;

    if (factors.unusualGeo) score += 20;

    if (score > 0 && factors.isNewIp && factors.isUnusualTime) score += 10;
    if (score > 0 && factors.isNewIp && factors.failedAttemptsRecent >= 2) score += 10;

    return Math.min(score, 100);
  }

  private scoreToLevel(score: number): RiskLevel {
    if (score >= AuthRiskEngine.CRITICAL_RISK_THRESHOLD) return 'critical';
    if (score >= AuthRiskEngine.HIGH_RISK_THRESHOLD) return 'high';
    if (score >= AuthRiskEngine.STEP_UP_THRESHOLD) return 'medium';
    return 'low';
  }

  private factorsToList(factors: AuthRiskFactors): string[] {
    const list: string[] = [];
    if (factors.failedAttemptsRecent >= 1) list.push(`Recent failed attempts: ${factors.failedAttemptsRecent}`);
    if (factors.isUnusualTime) list.push('Login during unusual hours');
    if (factors.isNewIp) list.push('Login from new IP address');
    if (factors.isNewDevice) list.push('Login from unrecognized device');
    if (factors.rapidAttempts) list.push('Rapid successive authentication attempts');
    if (factors.timeSinceLastLogin > 30 * 24 * 60 * 60 * 1000) list.push('Long period since last login');
    if (factors.unusualGeo) list.push('Login from unusual geographic location');
    return list;
  }

  private logSuspiciousActivity(
    userId: string,
    assessment: AuthRiskAssessment,
    ipAddress?: string,
    userAgent?: string,
  ): void {
    const entry: SuspiciousActivityEntry = {
      id: `suspicious_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      riskLevel: assessment.level,
      score: assessment.score,
      factors: assessment.factors,
      ipAddress,
      userAgent,
      detectedAt: new Date().toISOString(),
      resolved: false,
    };

    this.suspiciousActivity.unshift(entry);

    const logger = createLogger({ component: 'authRiskEngine' });
    logger.warn(
      { userId, riskLevel: assessment.level, score: assessment.score, factors: assessment.factors },
      'suspicious authentication activity detected',
    );

    if (this.eventBus) {
      void this.eventBus.publish({
        type: 'auth.suspicious_activity',
        timestamp: entry.detectedAt,
        payload: {
          suspiciousId: entry.id,
          userId,
          riskLevel: assessment.level,
          score: assessment.score,
          factors: assessment.factors,
        },
      });
    }
  }
}
