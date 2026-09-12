import React, { useEffect, useState, type ReactNode } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { secureSessionStorage } from '../services/secure-session';
import { displayLocale } from './demo-state';
import { deviceLocale } from './controller/useLocalActions';
import { ModelSetupScreen } from './screens/ModelSetupScreen';
import { useModelAssets } from './useModelAssets';

export function ModelSetupGate({ children }: { children: ReactNode }) {
  const assets = useModelAssets();
  const [locale, setLocale] = useState(() => displayLocale('system', deviceLocale()));
  useEffect(() => {
    if (assets.startupChecked) SplashScreen.hide();
  }, [assets.startupChecked]);
  useEffect(() => {
    let live = true;
    void secureSessionStorage.getItem('chroma-locale-preference').then(value => {
      if (live && (value === 'system' || value === 'ko' || value === 'en')) setLocale(displayLocale(value, deviceLocale()));
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  if (!assets.startupChecked) return null;
  return assets.state.status === 'ready' ? <>{children}</> : <ModelSetupScreen locale={locale} {...assets} />;
}
