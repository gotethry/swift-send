import type { PublicUser } from '../../auth/sessionTypes';

export interface LinkedWalletRecord {
  id: string;
  publicKey: string;
  provider: string;
  label: string;
  isPrimary: boolean;
  linkedAt: string;
}

function keyForUser(user: { id: string; email?: string; phone?: string }) {
  const email = user.email?.toLowerCase().trim();
  const phone = user.phone?.trim();
  return email ? `email:${email}` : phone ? `phone:${phone}` : `id:${user.id}`;
}

// In-memory user wallet linkage store (MVP).
const store = new Map<string, LinkedWalletRecord[]>();

export function listLinkedWallets(user: PublicUser): LinkedWalletRecord[] {
  return store.get(keyForUser(user)) || user.wallets || [];
}

export function upsertLinkedWallet(user: PublicUser, wallet: LinkedWalletRecord): LinkedWalletRecord[] {
  const key = keyForUser(user);
  const existing = store.get(key) || user.wallets || [];
  const next = existing.some((w) => w.publicKey === wallet.publicKey)
    ? existing.map((w) => (w.publicKey === wallet.publicKey ? { ...w, ...wallet } : w))
    : [wallet, ...existing];
  store.set(key, next);
  return next;
}

export function removeLinkedWallet(user: PublicUser, walletId: string): LinkedWalletRecord[] {
  const key = keyForUser(user);
  const existing = store.get(key) || user.wallets || [];
  const next = existing.filter((w) => w.id !== walletId);
  store.set(key, next);
  return next;
}

export function setPrimaryLinkedWallet(user: PublicUser, walletId: string): LinkedWalletRecord[] {
  const key = keyForUser(user);
  const existing = store.get(key) || user.wallets || [];
  const next = existing.map((w) => ({ ...w, isPrimary: w.id === walletId }));
  store.set(key, next);
  return next;
}

