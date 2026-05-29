import { apiFetch } from './api';

export type WalletRecoveryStatus = 'pending_guardian' | 'approved' | 'completed' | 'rejected' | 'cancelled';

export interface WalletRecoveryRequest {
  id: string;
  userId: string;
  guardianIdentifier: string;
  currentWalletId?: string;
  recoveryWallet: {
    id: string;
    publicKey: string;
    provider: string;
    label: string;
    isPrimary: boolean;
    linkedAt: string;
  };
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

async function requireJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { error?: string }).error || fallbackMessage);
  }
  return body as T;
}

export async function createWalletRecoveryRequest(input: {
  guardianIdentifier: string;
  currentWalletId?: string;
  recoveryWallet: {
    publicKey: string;
    provider: string;
    label?: string;
  };
  reason?: string;
}) {
  const response = await apiFetch('/wallets/recovery/requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return requireJson<{ request: WalletRecoveryRequest }>(response, 'Could not create recovery request');
}

export async function fetchWalletRecoveryRequests() {
  const response = await apiFetch('/wallets/recovery/requests');
  return requireJson<{ items: WalletRecoveryRequest[] }>(response, 'Could not load recovery requests');
}

export async function approveWalletRecoveryRequest(
  requestId: string,
  input: { guardianIdentifier: string; approvalCode: string; note?: string },
) {
  const response = await apiFetch(`/wallets/recovery/requests/${requestId}/approve`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return requireJson<{ request: WalletRecoveryRequest }>(response, 'Could not approve recovery request');
}

export async function completeWalletRecoveryRequest(requestId: string) {
  const response = await apiFetch(`/wallets/recovery/requests/${requestId}/complete`, {
    method: 'POST',
  });
  return requireJson<{ request: WalletRecoveryRequest; wallets: WalletRecoveryRequest['recoveryWallet'][] }>(
    response,
    'Could not complete recovery request',
  );
}

export async function fetchWalletRecoveryAuditLogs(limit = 10) {
  const response = await apiFetch(`/wallets/recovery/audit?limit=${limit}`);
  return requireJson<{ items: WalletRecoveryAuditLog[] }>(response, 'Could not load recovery audit logs');
}
