import { v4 as uuidv4 } from 'uuid';

export type EscrowStatus = 'held' | 'released' | 'refunded' | 'disputed' | 'cancelled' | 'expired';

export interface EscrowEntry {
  id: string;
  transferId: string;
  userId?: string;
  amount: number;
  currency: string;
  status: EscrowStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  failureReason?: string;
}

const TERMINAL_STATES: EscrowStatus[] = ['released', 'refunded', 'cancelled', 'expired'];
const ESCROW_TTL_MS = 72 * 60 * 60 * 1000;

const store: Record<string, EscrowEntry> = {};

export async function createEscrow(
  transferId: string,
  amount: number,
  currency = 'USD',
  userId?: string,
) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const e: EscrowEntry = {
    id,
    transferId,
    userId,
    amount,
    currency,
    status: 'held',
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + ESCROW_TTL_MS).toISOString(),
  };
  store[transferId] = e;
  return e;
}

export async function getEscrow(transferId: string) {
  return store[transferId] || null;
}

function assertNotTerminal(e: EscrowEntry, operation: string) {
  if (TERMINAL_STATES.includes(e.status)) {
    throw Object.assign(
      new Error(`Cannot ${operation} escrow for transfer '${e.transferId}': already ${e.status}`),
      { statusCode: 409, code: 'escrow_already_finalized', currentStatus: e.status }
    );
  }
}

async function updateStatus(transferId: string, status: EscrowStatus, failureReason?: string) {
  const e = store[transferId];
  if (!e) return null;
  assertNotTerminal(e, status);
  e.status = status;
  e.updatedAt = new Date().toISOString();
  if (failureReason) e.failureReason = failureReason;
  return e;
}

export async function releaseEscrow(transferId: string) {
  return updateStatus(transferId, 'released');
}

export async function refundEscrow(transferId: string, reason?: string) {
  return updateStatus(transferId, 'refunded', reason);
}

export async function disputeEscrow(transferId: string, reason?: string) {
  const e = store[transferId];
  if (!e) return null;
  if (TERMINAL_STATES.includes(e.status)) {
    throw Object.assign(
      new Error(`Cannot dispute escrow for transfer '${e.transferId}': already ${e.status}`),
      { statusCode: 409, code: 'escrow_already_finalized', currentStatus: e.status }
    );
  }
  e.status = 'disputed';
  e.updatedAt = new Date().toISOString();
  if (reason) e.failureReason = reason;
  return e;
}

export async function cancelEscrow(transferId: string, reason?: string) {
  const e = store[transferId];
  if (!e) return null;
  if (e.status !== 'held') {
    throw Object.assign(
      new Error(`Cannot cancel escrow for transfer '${e.transferId}': status is '${e.status}', only 'held' escrows can be cancelled`),
      { statusCode: 409, code: 'escrow_invalid_state', currentStatus: e.status }
    );
  }
  return updateStatus(transferId, 'cancelled', reason);
}

export function listExpiringEscrows(withinHours = 24) {
  const threshold = Date.now() + Math.max(0, withinHours) * 60 * 60 * 1000;
  return Object.values(store)
    .filter((escrow) => escrow.status === 'held' && new Date(escrow.expiresAt).getTime() <= threshold)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
}

export async function cleanupExpiredEscrows(now = Date.now()) {
  const expired: EscrowEntry[] = [];

  for (const escrow of Object.values(store)) {
    if (escrow.status !== 'held') {
      continue;
    }

    if (new Date(escrow.expiresAt).getTime() > now) {
      continue;
    }

    escrow.status = 'expired';
    escrow.updatedAt = new Date(now).toISOString();
    escrow.failureReason = 'Escrow expired automatically';
    expired.push(escrow);
  }

  return expired;
}
