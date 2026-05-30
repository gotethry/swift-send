import { createLogger } from '../../logger';
import type { FraudAssessment, FraudFlag, FraudRiskLevel } from './fraudService';
import type { TransferRecord } from '../transfers/domain';

export interface FraudReviewDecision {
  decision: 'approved' | 'rejected';
  reviewerId: string;
  reason?: string;
  createdAt: string;
}

export interface FraudReviewEntry {
  transferId: string;
  userId: string;
  amount: number;
  currency: string;
  recipientName: string;
  fraudScore: number;
  fraudLevel: FraudRiskLevel;
  flags: FraudFlag[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  reviewHistory: FraudReviewDecision[];
}

export class FraudReviewService {
  private readonly reviewQueue = new Map<string, FraudReviewEntry>();
  private readonly auditLog: FraudReviewDecision[] = [];
  private readonly logger = createLogger({ component: 'fraudReviewService' });

  enqueueReview(transfer: TransferRecord) {
    if (!transfer.fraud?.requiresReview) {
      return;
    }

    const now = new Date().toISOString();
    const entry: FraudReviewEntry = {
      transferId: transfer.id,
      userId: transfer.userId,
      amount: transfer.amount,
      currency: transfer.currency,
      recipientName: (transfer.recipient.metadata?.name as string | undefined) || 'Recipient',
      fraudScore: transfer.fraud.score,
      fraudLevel: transfer.fraud.level,
      flags: transfer.fraud.flags,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      reviewHistory: [],
    };

    this.reviewQueue.set(transfer.id, entry);
    this.logger.warn(
      { transferId: transfer.id, score: transfer.fraud.score, flags: transfer.fraud.flags.map((flag) => flag.code) },
      'transfer added to fraud review queue',
    );
  }

  listPendingReviews() {
    return Array.from(this.reviewQueue.values()).filter((entry) => entry.status === 'pending');
  }

  getReviewEntry(transferId: string) {
    return this.reviewQueue.get(transferId) ?? null;
  }

  recordDecision(transferId: string, decision: 'approved' | 'rejected', reviewerId: string, reason?: string) {
    const entry = this.reviewQueue.get(transferId);
    const now = new Date().toISOString();
    if (!entry) {
      throw new Error('review entry not found');
    }

    const reviewDecision: FraudReviewDecision = {
      decision,
      reviewerId,
      reason,
      createdAt: now,
    };

    entry.status = decision === 'approved' ? 'approved' : 'rejected';
    entry.updatedAt = now;
    entry.reviewHistory.push(reviewDecision);
    this.auditLog.unshift(reviewDecision);
    this.reviewQueue.delete(transferId);

    this.logger.info({ transferId, decision, reviewerId, reason }, 'fraud review decision recorded');
    return reviewDecision;
  }

  listReviewLogs(limit = 100) {
    return this.auditLog.slice(0, Math.max(0, limit));
  }
}
