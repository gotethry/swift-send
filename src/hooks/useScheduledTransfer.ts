import { useState, useCallback } from 'react';

export interface ScheduledTransfer {
  id: string;
  recipientIdentifier: string;
  recipientName?: string;
  amount: number;
  currency: string;
  scheduledAt: string;
  purposeCode?: string;
  notes?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  notifyBeforeMs: number;
  createdAt: string;
}

export type CreateScheduledTransferInput = Omit<
  ScheduledTransfer,
  'id' | 'status' | 'createdAt'
>;

const STORAGE_KEY = 'swift_send_scheduled_transfers';

function load(): ScheduledTransfer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ScheduledTransfer[];
  } catch {
    return [];
  }
}

function persist(list: ScheduledTransfer[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

function isPast(scheduledAt: string): boolean {
  return new Date(scheduledAt).getTime() <= Date.now();
}

export function useScheduledTransfer() {
  const [scheduled, setScheduled] = useState<ScheduledTransfer[]>(() =>
    load().sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
  );

  const sync = useCallback((next: ScheduledTransfer[]) => {
    persist(next);
    setScheduled(
      [...next].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
    );
  }, []);

  const schedule = useCallback(
    (input: CreateScheduledTransferInput): ScheduledTransfer => {
      if (isPast(input.scheduledAt)) {
        throw new Error('Scheduled time must be in the future');
      }
      const entry: ScheduledTransfer = {
        ...input,
        id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      sync([...load(), entry]);
      return entry;
    },
    [sync],
  );

  const cancel = useCallback(
    (id: string) => {
      sync(
        load().map((t) =>
          t.id === id && t.status === 'pending' ? { ...t, status: 'cancelled' } : t,
        ),
      );
    },
    [sync],
  );

  const markProcessing = useCallback(
    (id: string) => {
      sync(load().map((t) => (t.id === id ? { ...t, status: 'processing' } : t)));
    },
    [sync],
  );

  const markCompleted = useCallback(
    (id: string) => {
      sync(load().map((t) => (t.id === id ? { ...t, status: 'completed' } : t)));
    },
    [sync],
  );

  const markFailed = useCallback(
    (id: string) => {
      sync(load().map((t) => (t.id === id ? { ...t, status: 'failed' } : t)));
    },
    [sync],
  );

  return {
    scheduled,
    pending: scheduled.filter((t) => t.status === 'pending'),
    schedule,
    cancel,
    markProcessing,
    markCompleted,
    markFailed,
  };
}
