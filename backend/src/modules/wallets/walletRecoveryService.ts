import { randomBytes } from 'crypto';
import { ValidationError, NotFoundError } from '../../errors';
import type { LinkedWalletRecord } from './linkedWalletStore';

export type WalletRecoveryStatus = 'pending_guardian' | 'approved' | 'completed' | 'rejected' | 'cancelled';

export interface WalletRecoveryRequest {
  id: string;
  userId: string;
  userIdentifier: string;
  guardianIdentifier: string;
  currentWalletId?: string;
  recoveryWallet: LinkedWalletRecord;
  reason?: string;
  status: WalletRecoveryStatus;
  approvalCode: string;
  approvals: Array<{
    guardianIdentifier: string;
    approvedAt: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WalletRecoveryAuditLog {
  id: string;
  requestId: string;
  userId: string;
  action: 'requested' | 'approved' | 'completed' | 'rejected' | 'cancelled';
  actor: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface CreateWalletRecoveryRequestInput {
  userId: string;
  userIdentifier: string;
  guardianIdentifier: string;
  currentWalletId?: string;
  recoveryWallet: Omit<LinkedWalletRecord, 'id' | 'isPrimary' | 'linkedAt'> & Partial<Pick<LinkedWalletRecord, 'id' | 'isPrimary' | 'linkedAt'>>;
  reason?: string;
}

export class WalletRecoveryService {
  private readonly requests = new Map<string, WalletRecoveryRequest>();
  private readonly audits: WalletRecoveryAuditLog[] = [];

  createRequest(input: CreateWalletRecoveryRequestInput): WalletRecoveryRequest {
    const guardianIdentifier = input.guardianIdentifier.trim().toLowerCase();
    if (!guardianIdentifier) {
      throw new ValidationError('guardianIdentifier is required');
    }
    if (!input.recoveryWallet.publicKey || !input.recoveryWallet.provider) {
      throw new ValidationError('recoveryWallet.publicKey and recoveryWallet.provider are required');
    }

    const now = new Date().toISOString();
    const request: WalletRecoveryRequest = {
      id: `recovery_${Date.now()}_${randomBytes(3).toString('hex')}`,
      userId: input.userId,
      userIdentifier: input.userIdentifier,
      guardianIdentifier,
      currentWalletId: input.currentWalletId,
      recoveryWallet: {
        id: input.recoveryWallet.id || `wallet_recovered_${Date.now()}`,
        publicKey: input.recoveryWallet.publicKey,
        provider: input.recoveryWallet.provider,
        label: input.recoveryWallet.label || 'Recovered wallet',
        isPrimary: input.recoveryWallet.isPrimary ?? true,
        linkedAt: input.recoveryWallet.linkedAt || now,
      },
      reason: input.reason,
      status: 'pending_guardian',
      approvalCode: randomBytes(4).toString('hex').toUpperCase(),
      approvals: [],
      createdAt: now,
      updatedAt: now,
    };

    this.requests.set(request.id, request);
    this.audit(request, 'requested', input.userIdentifier, {
      guardianIdentifier,
      currentWalletId: input.currentWalletId,
      recoveryWalletPublicKey: maskPublicKey(request.recoveryWallet.publicKey),
    });
    return this.cloneRequest(request);
  }

  listRequests(userId: string): WalletRecoveryRequest[] {
    return Array.from(this.requests.values())
      .filter((request) => request.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((request) => this.cloneRequest(request));
  }

  approveRequest(
    requestId: string,
    input: { guardianIdentifier: string; approvalCode: string; note?: string },
  ): WalletRecoveryRequest {
    const request = this.getMutableRequest(requestId);
    if (request.status !== 'pending_guardian') {
      throw new ValidationError(`Recovery request cannot be approved while ${request.status}`);
    }

    const guardianIdentifier = input.guardianIdentifier.trim().toLowerCase();
    if (guardianIdentifier !== request.guardianIdentifier) {
      throw new ValidationError('Guardian identifier does not match this recovery request');
    }
    if (input.approvalCode.trim().toUpperCase() !== request.approvalCode) {
      throw new ValidationError('Invalid guardian approval code');
    }

    const now = new Date().toISOString();
    request.approvals = [{ guardianIdentifier, approvedAt: now, note: input.note }];
    request.status = 'approved';
    request.updatedAt = now;
    this.audit(request, 'approved', guardianIdentifier, { note: input.note });
    return this.cloneRequest(request);
  }

  completeRequest(requestId: string, actor: string): WalletRecoveryRequest {
    const request = this.getMutableRequest(requestId);
    if (request.status !== 'approved') {
      throw new ValidationError(`Recovery request cannot be completed while ${request.status}`);
    }

    const now = new Date().toISOString();
    request.status = 'completed';
    request.updatedAt = now;
    request.completedAt = now;
    this.audit(request, 'completed', actor, {
      recoveryWalletId: request.recoveryWallet.id,
      recoveryWalletPublicKey: maskPublicKey(request.recoveryWallet.publicKey),
    });
    return this.cloneRequest(request);
  }

  listAuditLogs(userId: string, limit = 50): WalletRecoveryAuditLog[] {
    return this.audits
      .filter((audit) => audit.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, Math.min(Math.max(limit, 1), 100))
      .map((audit) => ({ ...audit, details: { ...audit.details } }));
  }

  private getMutableRequest(requestId: string) {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new NotFoundError(`Recovery request '${requestId}' not found`);
    }
    return request;
  }

  private audit(
    request: WalletRecoveryRequest,
    action: WalletRecoveryAuditLog['action'],
    actor: string,
    details: Record<string, unknown>,
  ) {
    this.audits.push({
      id: `recovery_audit_${Date.now()}_${randomBytes(3).toString('hex')}`,
      requestId: request.id,
      userId: request.userId,
      action,
      actor,
      details,
      createdAt: new Date().toISOString(),
    });
  }

  private cloneRequest(request: WalletRecoveryRequest): WalletRecoveryRequest {
    return {
      ...request,
      recoveryWallet: { ...request.recoveryWallet },
      approvals: request.approvals.map((approval) => ({ ...approval })),
    };
  }
}

function maskPublicKey(publicKey: string) {
  if (publicKey.length <= 16) return publicKey;
  return `${publicKey.slice(0, 8)}...${publicKey.slice(-8)}`;
}
