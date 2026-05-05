import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { useAuth } from './AuthContext';
import { GlobalSettings, defaultThemes, defaultStrategies, defaultOutlets } from '../types/globalSettings';
import { defaultKretsHierarchy } from '../data/enhancedKretsData';

interface GlobalSettingsContextType {
  settings: GlobalSettings;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  updateSettings: (settings: GlobalSettings, password?: string) => Promise<boolean>;
  verifyAdmin: (password?: string) => Promise<boolean>;
}

const GlobalSettingsContext = createContext<GlobalSettingsContextType | undefined>(undefined);

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-9a7b4805`;

const defaultSettings: GlobalSettings = {
  counties: defaultKretsHierarchy,
  themes: defaultThemes,
  strategies: defaultStrategies,
  outlets: defaultOutlets,
  version: 1,
  lastUpdated: new Date().toISOString()
};

export function GlobalSettingsProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const [settings, setSettings] = useState<GlobalSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);

  const authHeader = () => `Bearer ${accessToken || publicAnonKey}`;

  const normalizeSettings = (incoming?: Partial<GlobalSettings> | null): GlobalSettings => ({
    ...defaultSettings,
    ...(incoming || {}),
    counties: Array.isArray(incoming?.counties) && incoming.counties.length > 0 ? incoming.counties : defaultKretsHierarchy,
    themes: Array.isArray(incoming?.themes) && incoming.themes.length > 0 ? incoming.themes : defaultThemes,
    strategies: Array.isArray(incoming?.strategies) && incoming.strategies.length > 0 ? incoming.strategies : defaultStrategies,
    outlets: Array.isArray(incoming?.outlets) && incoming.outlets.length > 0 ? incoming.outlets : defaultOutlets,
    version: typeof incoming?.version === 'number' ? incoming.version : defaultSettings.version,
    lastUpdated: incoming?.lastUpdated || defaultSettings.lastUpdated
  });

  const refreshSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/global-settings`, {
        headers: {
          'Authorization': authHeader()
        }
      });

      if (!response.ok) {
        console.log('Failed to fetch settings, using defaults');
        setSettings(normalizeSettings());
        return;
      }

      const { settings: fetchedSettings } = await response.json();
      setSettings(normalizeSettings(fetchedSettings));
    } catch (error) {
      console.log(`Exception fetching settings: ${error}`);
      setSettings(normalizeSettings());
    } finally {
      setLoading(false);
    }
  };

  const verifyAdmin = async (password?: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/admin/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader()
        },
        body: JSON.stringify({ password })
      });

      return response.ok;
    } catch (error) {
      console.log(`Exception verifying admin access: ${error}`);
      return false;
    }
  };

  const updateSettings = async (newSettings: GlobalSettings, password?: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/admin/global-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader()
        },
        body: JSON.stringify({
          password,
          settings: {
            ...newSettings,
            version: newSettings.version + 1,
            lastUpdated: new Date().toISOString()
          }
        })
      });

      if (!response.ok) {
        console.log('Failed to update settings');
        return false;
      }

      const { settings: savedSettings } = await response.json();
      setSettings(normalizeSettings(savedSettings));
      return true;
    } catch (error) {
      console.log(`Exception updating settings: ${error}`);
      return false;
    }
  };

  useEffect(() => {
    refreshSettings();
  }, [accessToken]);

  return (
    <GlobalSettingsContext.Provider value={{
      settings,
      loading,
      refreshSettings,
      updateSettings,
      verifyAdmin
    }}>
      {children}
    </GlobalSettingsContext.Provider>
  );
}

export function useGlobalSettings() {
  const context = useContext(GlobalSettingsContext);
  if (!context) {
    throw new Error('useGlobalSettings must be used within GlobalSettingsProvider');
  }
  return context;
}
