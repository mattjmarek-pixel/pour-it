import React, { createContext, useContext, useState } from 'react';
import { MODE_COLORS } from '@/constants/colors';
import type { AppMode } from '@/constants/colors';

interface ModeContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  accentColor: string;
}

const ModeContext = createContext<ModeContextValue>({
  mode: 'spirits',
  setMode: () => {},
  accentColor: MODE_COLORS.spirits,
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('spirits');

  const setMode = (newMode: AppMode) => {
    setModeState(newMode);
  };

  return (
    <ModeContext.Provider value={{ mode, setMode, accentColor: MODE_COLORS[mode] }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
