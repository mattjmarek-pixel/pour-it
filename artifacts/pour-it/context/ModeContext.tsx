import React, { createContext, useContext, useState } from 'react';
import { MODE_COLORS } from '@/constants/colors';
import type { AppMode } from '@/constants/colors';
import type { Product } from '@/src/data/recipes';

interface PendingProduct {
  product: Product;
  mode: AppMode;
}

interface ModeContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  accentColor: string;
  pendingProduct: PendingProduct | null;
  setPendingProduct: (pending: PendingProduct | null) => void;
}

const ModeContext = createContext<ModeContextValue>({
  mode: 'spirits',
  setMode: () => {},
  accentColor: MODE_COLORS.spirits,
  pendingProduct: null,
  setPendingProduct: () => {},
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('spirits');
  const [pendingProduct, setPendingProduct] = useState<PendingProduct | null>(null);

  const setMode = (newMode: AppMode) => {
    setModeState(newMode);
  };

  return (
    <ModeContext.Provider
      value={{
        mode,
        setMode,
        accentColor: MODE_COLORS[mode],
        pendingProduct,
        setPendingProduct,
      }}
    >
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
