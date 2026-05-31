import { useState, useCallback } from 'react';

export type IdentifierType = 'email' | 'phone' | 'wallet';

export interface Beneficiary {
  id: string;
  name: string;
  identifier: string;
  identifierType: IdentifierType;
  walletAddress?: string;
  nickname?: string;
  isFavorite: boolean;
  country?: string;
  currency?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'swift_send_beneficiaries';

function load(): Beneficiary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Beneficiary[];
  } catch {
    return [];
  }
}

function persist(list: Beneficiary[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

function sorted(list: Beneficiary[]): Beneficiary[] {
  return [...list].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return b.isFavorite ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export function useBeneficiaries() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>(() => sorted(load()));

  const sync = useCallback((next: Beneficiary[]) => {
    persist(next);
    setBeneficiaries(sorted(next));
  }, []);

  const add = useCallback(
    (data: Omit<Beneficiary, 'id' | 'isFavorite' | 'createdAt' | 'updatedAt'>): Beneficiary => {
      const now = new Date().toISOString();
      const entry: Beneficiary = {
        ...data,
        id: `ben_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      };
      sync([...load(), entry]);
      return entry;
    },
    [sync],
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<Beneficiary, 'id' | 'createdAt'>>) => {
      sync(
        load().map((b) =>
          b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b,
        ),
      );
    },
    [sync],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      const current = load();
      const target = current.find((b) => b.id === id);
      if (!target) return;
      sync(
        current.map((b) =>
          b.id === id
            ? { ...b, isFavorite: !b.isFavorite, updatedAt: new Date().toISOString() }
            : b,
        ),
      );
    },
    [sync],
  );

  const remove = useCallback(
    (id: string) => {
      sync(load().filter((b) => b.id !== id));
    },
    [sync],
  );

  return {
    beneficiaries,
    favorites: beneficiaries.filter((b) => b.isFavorite),
    add,
    update,
    toggleFavorite,
    remove,
  };
}
