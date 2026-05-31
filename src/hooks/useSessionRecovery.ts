import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  sessionRecovery,
  type PendingTransferState,
  type ActiveSession,
} from '@/services/sessionRecovery';

interface UseSessionRecoveryOptions {
  userId?: string;
  walletId?: string;
  onTransferRestored?: (state: PendingTransferState) => void;
}

export function useSessionRecovery({
  userId,
  walletId,
  onTransferRestored,
}: UseSessionRecoveryOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [recoveredTransfer, setRecoveredTransfer] = useState<PendingTransferState | null>(null);

  // Persist the current route whenever it changes
  useEffect(() => {
    if (!userId) return;
    sessionRecovery.saveSession({
      userId,
      walletId,
      lastRoute: location.pathname + location.search,
    });
  }, [userId, walletId, location]);

  // On mount, check for an interrupted transfer flow and offer to restore
  useEffect(() => {
    const pending = sessionRecovery.loadPendingTransfer();
    if (!pending) return;

    setRecoveredTransfer(pending);

    if (onTransferRestored) {
      onTransferRestored(pending);
    } else {
      toast('Transfer interrupted — resume?', {
        duration: 8000,
        action: {
          label: 'Resume',
          onClick: () => {
            navigate('/send', { state: { restoreTransfer: pending } });
          },
        },
        cancel: {
          label: 'Dismiss',
          onClick: () => {
            sessionRecovery.clearPendingTransfer();
            setRecoveredTransfer(null);
          },
        },
      });
    }
  }, []);

  const saveTransferState = useCallback((state: Omit<PendingTransferState, 'savedAt'>) => {
    sessionRecovery.savePendingTransfer(state);
  }, []);

  const clearTransferState = useCallback(() => {
    sessionRecovery.clearPendingTransfer();
    setRecoveredTransfer(null);
  }, []);

  const clearAll = useCallback(() => {
    sessionRecovery.clearAll();
    setRecoveredTransfer(null);
  }, []);

  return {
    recoveredTransfer,
    saveTransferState,
    clearTransferState,
    clearAll,
  };
}

export function useRestoreSession(userId?: string): ActiveSession | null {
  const [session] = useState<ActiveSession | null>(() => {
    if (!userId) return null;
    const s = sessionRecovery.loadSession();
    return s?.userId === userId ? s : null;
  });
  return session;
}
