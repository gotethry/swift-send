import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type BandwidthMode = 'auto' | 'full' | 'low';

interface BandwidthState {
  mode: BandwidthMode;
  effective: 'full' | 'low';
}

interface BandwidthContextType extends BandwidthState {
  setMode: (mode: BandwidthMode) => void;
  isLowBandwidth: boolean;
}

const STORAGE_KEY = 'swift-send-bandwidth-mode';

function readPersistedMode(): BandwidthMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'auto' || stored === 'full' || stored === 'low') return stored;
  } catch {
    /* ignore */
  }
  return 'auto';
}

function computeAutoEffective(): 'full' | 'low' {
  try {
    // Network Information API (not supported everywhere)
    const conn = (navigator as any).connection as
      | { saveData?: boolean; effectiveType?: string }
      | undefined;
    if (conn?.saveData) return 'low';
    const type = conn?.effectiveType;
    if (type === 'slow-2g' || type === '2g') return 'low';
  } catch {
    /* ignore */
  }
  return 'full';
}

const BandwidthContext = createContext<BandwidthContextType | undefined>(undefined);

export function BandwidthProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<BandwidthMode>(readPersistedMode);
  const [autoEffective, setAutoEffective] = useState<'full' | 'low'>(() => computeAutoEffective());

  useEffect(() => {
    // React to connection changes when available.
    const conn = (navigator as any).connection as
      | { addEventListener?: (name: string, fn: () => void) => void; removeEventListener?: (name: string, fn: () => void) => void }
      | undefined;

    const update = () => setAutoEffective(computeAutoEffective());
    update();

    conn?.addEventListener?.('change', update);
    return () => conn?.removeEventListener?.('change', update);
  }, []);

  const setMode = useCallback((next: BandwidthMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const effective: 'full' | 'low' = mode === 'auto' ? autoEffective : mode === 'low' ? 'low' : 'full';

  useEffect(() => {
    // Used by global CSS gates.
    document.documentElement.dataset.bandwidth = effective;
  }, [effective]);

  const value = useMemo<BandwidthContextType>(() => {
    return {
      mode,
      effective,
      setMode,
      isLowBandwidth: effective === 'low',
    };
  }, [mode, effective, setMode]);

  return <BandwidthContext.Provider value={value}>{children}</BandwidthContext.Provider>;
}

export function useBandwidth(): BandwidthContextType {
  const ctx = useContext(BandwidthContext);
  if (!ctx) throw new Error('useBandwidth must be used inside BandwidthProvider');
  return ctx;
}

