import { v4 as uuidv4 } from 'uuid';
import { ValidationError } from '../../errors';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalReason = 'large_value' | 'high_risk_destination' | 'unusual_pattern' | 'compliance_flag';

export interface ApprovalRequest {
  id: string;
  transferId: string;
  userId: string;
  amount: number;
  currency: string;
  reason: ApprovalReason;
  status: ApprovalStatus;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalQueueStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  averageProcessingTimeMs: number;
}

const APPROVAL_THRESHOLD = 5000;

export class TransactionApprovalService {
  private store = new Map<string, ApprovalRequest>();

  constructor() {
    this.seedDemoApprovals();
  }

  private seedDemoApprovals() {
    const now = Date.now();
    const demo: ApprovalRequest[] = [
      {
        id: 'approval_demo_1',
        transferId: 'transfer_demo_large_1',
        userId: 'user_demo_1',
        amount: 25000,
        currency: 'USDC',
        reason: 'large_value',
        status: 'pending',
        requestedAt: new Date(now - 3600000).toISOString(),
        notes: 'High-value transfer to Mexico',
      },
      {
        id: 'approval_demo_2',
        transferId: 'transfer_demo_risk_1',
        userId: 'user_demo_2',
        amount: 3000,
        currency: 'USDC',
        reason: 'high_risk_destination',
        status: 'pending',
        requestedAt: new Date(now - 7200000).toISOString(),
        notes: 'Transfer to restricted region',
      },
      {
        id: 'approval_demo_3',
        transferId: 'transfer_demo_approved_1',
        userId: 'user_demo_3',
        amount: 15000,
        currency: 'USDC',
        reason: 'large_value',
        status: 'approved',
        requestedAt: new Date(now - 86400000).toISOString(),
        reviewedBy: 'admin_demo',
        reviewedAt: new Date(now - 82800000).toISOString(),
        notes: 'Approved after SOWC verification',
      },
      {
        id: 'approval_demo_4',
        transferId: 'transfer_demo_rejected_1',
        userId: 'user_demo_4',
        amount: 50000,
        currency: 'USDC',
        reason: 'large_value',
        status: 'rejected',
        requestedAt: new Date(now - 172800000).toISOString(),
        reviewedBy: 'admin_demo',
        reviewedAt: new Date(now - 169200000).toISOString(),
        rejectionReason: 'Failed enhanced due diligence',
        notes: 'Source of funds could not be verified',
      },
    ];

    demo.forEach((r) => this.store.set(r.id, r));
  }

  requestApproval(input: {
    transferId: string;
    userId: string;
    amount: number;
    currency: string;
    reason: ApprovalReason;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): ApprovalRequest {
    const existing = Array.from(this.store.values()).find(
      (r) => r.transferId === input.transferId && r.status === 'pending',
    );
    if (existing) return existing;

    const request: ApprovalRequest = {
      id: `approval_${uuidv4().slice(0, 8)}`,
      transferId: input.transferId,
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
      reason: input.reason,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      notes: input.notes,
      metadata: input.metadata,
    };

    this.store.set(request.id, request);
    return request;
  }

  approveRequest(approvalId: string, reviewerId: string): ApprovalRequest {
    const request = this.store.get(approvalId);
    if (!request) {
      throw new ValidationError(`Approval request not found: ${approvalId}`);
    }
    if (request.status !== 'pending') {
      throw new ValidationError(`Approval request is already ${request.status}`);
    }

    request.status = 'approved';
    request.reviewedBy = reviewerId;
    request.reviewedAt = new Date().toISOString();
    this.store.set(request.id, request);
    return request;
  }

  rejectRequest(approvalId: string, reviewerId: string, reason: string): ApprovalRequest {
    const request = this.store.get(approvalId);
    if (!request) {
      throw new ValidationError(`Approval request not found: ${approvalId}`);
    }
    if (request.status !== 'pending') {
      throw new ValidationError(`Approval request is already ${request.status}`);
    }

    request.status = 'rejected';
    request.reviewedBy = reviewerId;
    request.reviewedAt = new Date().toISOString();
    request.rejectionReason = reason;
    this.store.set(request.id, request);
    return request;
  }

  getRequest(approvalId: string): ApprovalRequest | undefined {
    return this.store.get(approvalId);
  }

  getByTransferId(transferId: string): ApprovalRequest | undefined {
    return Array.from(this.store.values()).find(
      (r) => r.transferId === transferId,
    );
  }

  listPending(limit = 20): ApprovalRequest[] {
    return Array.from(this.store.values())
      .filter((r) => r.status === 'pending')
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
      .slice(0, limit);
  }

  listAll(limit = 50): ApprovalRequest[] {
    return Array.from(this.store.values())
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
      .slice(0, limit);
  }

  getStats(): ApprovalQueueStats {
    const all = Array.from(this.store.values());
    const pending = all.filter((r) => r.status === 'pending');
    const approved = all.filter((r) => r.status === 'approved');
    const rejected = all.filter((r) => r.status === 'rejected');

    const processedApprovals = approved.filter((r) => r.reviewedAt);
    let totalProcessingTime = 0;
    for (const a of processedApprovals) {
      const requested = new Date(a.requestedAt).getTime();
      const reviewed = new Date(a.reviewedAt!).getTime();
      totalProcessingTime += Math.max(0, reviewed - requested);
    }
    const averageProcessingTimeMs = processedApprovals.length > 0
      ? Math.round(totalProcessingTime / processedApprovals.length)
      : 0;

    return {
      total: all.length,
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      averageProcessingTimeMs,
    };
  }

  requiresApproval(amount: number, destinationCountry?: string, riskScore?: string): ApprovalReason | null {
    if (amount >= APPROVAL_THRESHOLD) {
      return 'large_value';
    }
    if (destinationCountry && ['RU', 'BY', 'IR', 'KP', 'VE'].includes(destinationCountry.toUpperCase())) {
      return 'high_risk_destination';
    }
    if (riskScore === 'high') {
      return 'compliance_flag';
    }
    return null;
  }
}
