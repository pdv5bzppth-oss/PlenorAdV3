import React, { createContext, useContext, ReactNode } from 'react';
import { defaultKretsHierarchy, County } from '../data/enhancedKretsData';
import { useGlobalSettings } from './GlobalSettingsContext';

interface KretsContextType {
  counties: County[];
  loading: boolean;
  refreshKrets: () => Promise<void>;
  updateKrets: (counties: County[], password?: string) => Promise<boolean>;
}

const KretsContext = createContext<KretsContextType | undefined>(undefined);

export function KretsProvider({ children }: { children: ReactNode }) {
  const { settings, loading, refreshSettings, updateSettings } = useGlobalSettings();
  const counties = settings.counties?.length ? settings.counties : defaultKretsHierarchy;
  const refreshKrets = refreshSettings;

  const updateKrets = async (newCounties: County[], password?: string): Promise<boolean> => {
    return updateSettings({ ...settings, counties: newCounties }, password);
  };

  return (
    <KretsContext.Provider value={{
      counties,
      loading,
      refreshKrets,
      updateKrets
    }}>
      {children}
    </KretsContext.Provider>
  );
}

export function useKrets() {
  const context = useContext(KretsContext);
  if (!context) {
    throw new Error('useKrets must be used within KretsProvider');
  }
  return context;
}
