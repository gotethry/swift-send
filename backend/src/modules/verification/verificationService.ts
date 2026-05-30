import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'flagged';
export type VerificationMethod = 'phone' | 'email' | 'id_document' | 'bank_account' | 'address';
export type BadgeType = 'verified_recipient' | 'trusted_recipient' | 'frequent_recipient' | 'business_verified' | 'new_recipient';

export interface VerificationBadge {
  type: BadgeType;
  label: string;
  description: string;
  icon: string;
  color: string;
  level: number;
}

export interface RecipientVerification {
  recipientId: string;
  recipientName: string;
  recipientPhone: string;
  status: VerificationStatus;
  badges: VerificationBadge[];
  methods: VerificationMethod[];
  verifiedAt?: string;
  lastCheckedAt: string;
  trustScore: number;
  totalTransfers: number;
  totalVolume: number;
  firstTransferAt?: string;
  flags?: string[];
  notes?: string;
}

export interface VerificationRequest {
  id: string;
  recipientId: string;
  recipientName: string;
  recipientPhone: string;
  requestedMethod: VerificationMethod;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

const BADGE_DEFINITIONS: Record<BadgeType, Omit<VerificationBadge, 'level'>> = {
  verified_recipient: {
    type: 'verified_recipient',
    label: 'Verified',
    description: 'Identity has been verified',
    icon: 'CheckCircle2',
    color: 'text-green-500',
  },
  trusted_recipient: {
    type: 'trusted_recipient',
    label: 'Trusted',
    description: 'Successfully received multiple transfers',
    icon: 'Shield',
    color: 'text-blue-500',
  },
  frequent_recipient: {
    type: 'frequent_recipient',
    label: 'Frequent',
    description: 'Regular transfer recipient',
    icon: 'Zap',
    color: 'text-purple-500',
  },
  business_verified: {
    type: 'business_verified',
    label: 'Business',
    description: 'Verified business account',
    icon: 'Building2',
    color: 'text-amber-500',
  },
  new_recipient: {
    type: 'new_recipient',
    label: 'New',
    description: 'First time recipient',
    icon: 'UserPlus',
    color: 'text-gray-400',
  },
};

export class VerificationService {
  private verifications = new Map<string, RecipientVerification>();
  private verificationRequests: VerificationRequest[] = [];

  constructor() {
    this.seedDemoVerifications();
  }

  private seedDemoVerifications() {
    const now = Date.now();
    const demo: RecipientVerification[] = [
      {
        recipientId: 'recipient_demo_1',
        recipientName: 'Maria Garcia',
        recipientPhone: '+525512345678',
        status: 'verified',
        badges: [
          { ...BADGE_DEFINITIONS.verified_recipient, level: 3 },
          { ...BADGE_DEFINITIONS.trusted_recipient, level: 2 },
          { ...BADGE_DEFINITIONS.frequent_recipient, level: 1 },
        ],
        methods: ['phone', 'id_document'],
        verifiedAt: new Date(now - 7776000000).toISOString(),
        lastCheckedAt: new Date().toISOString(),
        trustScore: 92,
        totalTransfers: 24,
        totalVolume: 45000,
        firstTransferAt: new Date(now - 15552000000).toISOString(),
      },
      {
        recipientId: 'recipient_demo_2',
        recipientName: 'John Okafor',
        recipientPhone: '+2348012345678',
        status: 'verified',
        badges: [
          { ...BADGE_DEFINITIONS.verified_recipient, level: 3 },
          { ...BADGE_DEFINITIONS.business_verified, level: 2 },
        ],
        methods: ['phone', 'email', 'bank_account'],
        verifiedAt: new Date(now - 5184000000).toISOString(),
        lastCheckedAt: new Date().toISOString(),
        trustScore: 88,
        totalTransfers: 12,
        totalVolume: 120000,
        firstTransferAt: new Date(now - 10368000000).toISOString(),
      },
      {
        recipientId: 'recipient_demo_3',
        recipientName: 'Wei Chen',
        recipientPhone: '+8613800138000',
        status: 'unverified',
        badges: [
          { ...BADGE_DEFINITIONS.new_recipient, level: 0 },
        ],
        methods: [],
        lastCheckedAt: new Date().toISOString(),
        trustScore: 10,
        totalTransfers: 0,
        totalVolume: 0,
      },
      {
        recipientId: 'recipient_demo_4',
        recipientName: 'Sarah Johnson',
        recipientPhone: '+447700900001',
        status: 'pending',
        badges: [
          { ...BADGE_DEFINITIONS.new_recipient, level: 0 },
        ],
        methods: ['phone'],
        lastCheckedAt: new Date().toISOString(),
        trustScore: 30,
        totalTransfers: 0,
        totalVolume: 0,
      },
    ];

    demo.forEach((v) => this.verifications.set(v.recipientId, v));
  }

  getVerification(recipientId: string): RecipientVerification | undefined {
    return this.verifications.get(recipientId);
  }

  getAllVerifications(limit = 50): RecipientVerification[] {
    return Array.from(this.verifications.values()).slice(0, limit);
  }

  getVerificationsByStatus(status: VerificationStatus, limit = 50): RecipientVerification[] {
    return Array.from(this.verifications.values())
      .filter((v) => v.status === status)
      .slice(0, limit);
  }

  createVerificationRequest(input: {
    recipientId: string;
    recipientName: string;
    recipientPhone: string;
    method: VerificationMethod;
  }): VerificationRequest {
    const existing = this.verificationRequests.find(
      (r) => r.recipientId === input.recipientId && r.status === 'pending',
    );
    if (existing) return existing;

    const request: VerificationRequest = {
      id: `ver_req_${uuidv4().slice(0, 8)}`,
      recipientId: input.recipientId,
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      requestedMethod: input.method,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };

    this.verificationRequests.push(request);

    const existingVerification = this.verifications.get(input.recipientId);
    if (existingVerification) {
      existingVerification.status = 'pending';
      existingVerification.methods = [...new Set([...existingVerification.methods, input.method])];
      existingVerification.lastCheckedAt = new Date().toISOString();
    } else {
      this.verifications.set(input.recipientId, {
        recipientId: input.recipientId,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        status: 'pending',
        badges: [{ ...BADGE_DEFINITIONS.new_recipient, level: 0 }],
        methods: [input.method],
        lastCheckedAt: new Date().toISOString(),
        trustScore: 20,
        totalTransfers: 0,
        totalVolume: 0,
      });
    }

    return request;
  }

  approveVerification(verificationRequestId: string, reviewerId: string): VerificationRequest | null {
    const request = this.verificationRequests.find((r) => r.id === verificationRequestId);
    if (!request || request.status !== 'pending') return null;

    request.status = 'approved';
    request.reviewedBy = reviewerId;
    request.reviewedAt = new Date().toISOString();

    const verification = this.verifications.get(request.recipientId);
    if (verification) {
      verification.status = 'verified';
      verification.verifiedAt = new Date().toISOString();
      verification.lastCheckedAt = new Date().toISOString();
      if (!verification.badges.find((b) => b.type === 'verified_recipient')) {
        verification.badges.push({ ...BADGE_DEFINITIONS.verified_recipient, level: 3 });
      }
      verification.trustScore = Math.min(100, verification.trustScore + 40);
    }

    return request;
  }

  rejectVerification(verificationRequestId: string, reviewerId: string, reason: string): VerificationRequest | null {
    const request = this.verificationRequests.find((r) => r.id === verificationRequestId);
    if (!request || request.status !== 'pending') return null;

    request.status = 'rejected';
    request.reviewedBy = reviewerId;
    request.reviewedAt = new Date().toISOString();
    request.rejectionReason = reason;

    return request;
  }

  getVerificationRequests(limit = 50): VerificationRequest[] {
    return this.verificationRequests.slice(0, limit);
  }

  getVerificationRequestById(id: string): VerificationRequest | undefined {
    return this.verificationRequests.find((r) => r.id === id);
  }

  recalculateTrustScore(recipientId: string, transferAmount: number): void {
    const verification = this.verifications.get(recipientId);
    if (!verification) return;

    verification.totalTransfers += 1;
    verification.totalVolume += transferAmount;
    verification.lastCheckedAt = new Date().toISOString();

    const badges: VerificationBadge[] = [];

    if (verification.status === 'verified') {
      badges.push({ ...BADGE_DEFINITIONS.verified_recipient, level: 3 });
    }

    if (verification.totalTransfers >= 5) {
      badges.push({ ...BADGE_DEFINITIONS.trusted_recipient, level: 2 });
    }

    if (verification.totalTransfers >= 10) {
      badges.push({ ...BADGE_DEFINITIONS.frequent_recipient, level: 1 });
    }

    if (verification.methods.includes('bank_account') || verification.methods.includes('id_document')) {
      badges.push({ ...BADGE_DEFINITIONS.business_verified, level: 2 });
    }

    if (badges.length === 0) {
      badges.push({ ...BADGE_DEFINITIONS.new_recipient, level: 0 });
    }

    verification.badges = badges;

    const baseScore = verification.status === 'verified' ? 60 : 20;
    const volumeScore = Math.min(20, verification.totalVolume / 10000);
    const transferScore = Math.min(20, verification.totalTransfers * 2);
    verification.trustScore = Math.min(100, baseScore + volumeScore + transferScore);
  }

  getBadgeDefinitions(): Record<BadgeType, Omit<VerificationBadge, 'level'>> {
    return BADGE_DEFINITIONS;
  }
}
