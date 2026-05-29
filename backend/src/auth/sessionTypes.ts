/** Public user shape returned to the web client (matches frontend `User`). */
export interface PublicUser {
  id: string;
  name: string;
  phone: string;
  email?: string;
  balance: number;
  usdcBalance: number;
  localCurrency: string;
  exchangeRate: number;
  isVerified: boolean;
  onboardingCompleted: boolean;
  walletAddress?: string; // Legacy field for backward compatibility
  wallets?: Array<{
    id: string;
    publicKey: string;
    provider: string;
    label: string;
    isPrimary: boolean;
    linkedAt: string;
  }>;
  accountType?: 'personal' | 'business';
  businessProfile?: {
    companyName: string;
    role: 'owner' | 'finance_admin' | 'operator';
    teamSize: number;
    permissions: string[];
    teamMembers: Array<{
      name: string;
      email: string;
      role: 'owner' | 'admin' | 'approver' | 'viewer';
      status: 'active' | 'invited';
    }>;
  };
  createdAt: string;
}

export type UserRole = 'admin' | 'user';

export interface SessionMetadata {
  createdAt: number;
  lastActivityAt: number;
  trustedIps: string[];
  lastKnownIp?: string;
}

export interface Session {
  id: string;
  email?: string;
  phone?: string;
  verified: boolean;
  hasWallet: boolean;
  onboardingCompleted: boolean;
  /**
   * When true, the session must complete a step-up verification challenge
   * before accessing protected routes (forced re-authentication).
   */
  reauthRequired?: boolean;
  reauthReason?: 'new_ip' | 'new_device' | 'risk';
  reauthFactors?: string[];
  reauthAssessedAt?: string;
  role?: UserRole;
  user?: PublicUser;
  metadata: SessionMetadata;
  expiresAt: number;
}

export interface JwtSessionPayload {
  sub: string;
  verified: boolean;
  hasWallet: boolean;
  role?: UserRole;
}

export interface SessionInfo {
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  inactivityTimeoutMs: number;
  warningThresholdMs: number;
}
