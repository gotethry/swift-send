const SESSION_KEY = 'swift_send_active_session';
const TRANSFER_STATE_KEY = 'swift_send_pending_transfer';

export type TransferStep = 'recipient' | 'amount' | 'confirm' | 'pin' | 'processing';

export interface PendingTransferState {
  step: TransferStep;
  recipientIdentifier?: string;
  recipientName?: string;
  amount?: string;
  currency?: string;
  purposeCode?: string;
  notes?: string;
  draftId?: string;
  savedAt: number;
}

export interface ActiveSession {
  userId: string;
  walletId?: string;
  lastRoute: string;
  savedAt: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const TRANSFER_TTL_MS = 15 * 60 * 1000;

function isExpired(savedAt: number, ttlMs: number): boolean {
  return Date.now() - savedAt > ttlMs;
}

export const sessionRecovery = {
  saveSession(session: Omit<ActiveSession, 'savedAt'>): void {
    try {
      const entry: ActiveSession = { ...session, savedAt: Date.now() };
      localStorage.setItem(SESSION_KEY, JSON.stringify(entry));
    } catch {
      // ignore storage errors
    }
  },

  loadSession(): ActiveSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as ActiveSession;
      if (isExpired(session.savedAt, SESSION_TTL_MS)) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },

  clearSession(): void {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore storage errors
    }
  },

  savePendingTransfer(state: Omit<PendingTransferState, 'savedAt'>): void {
    try {
      const entry: PendingTransferState = { ...state, savedAt: Date.now() };
      localStorage.setItem(TRANSFER_STATE_KEY, JSON.stringify(entry));
    } catch {
      // ignore storage errors
    }
  },

  loadPendingTransfer(): PendingTransferState | null {
    try {
      const raw = localStorage.getItem(TRANSFER_STATE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw) as PendingTransferState;
      if (isExpired(state.savedAt, TRANSFER_TTL_MS)) {
        localStorage.removeItem(TRANSFER_STATE_KEY);
        return null;
      }
      // Don't restore mid-processing state — the transfer may have already executed
      if (state.step === 'processing') {
        localStorage.removeItem(TRANSFER_STATE_KEY);
        return null;
      }
      return state;
    } catch {
      return null;
    }
  },

  clearPendingTransfer(): void {
    try {
      localStorage.removeItem(TRANSFER_STATE_KEY);
    } catch {
      // ignore storage errors
    }
  },

  clearAll(): void {
    this.clearSession();
    this.clearPendingTransfer();
  },
};
