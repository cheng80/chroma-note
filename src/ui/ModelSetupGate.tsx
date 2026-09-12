import React, { useEffect, useState, type ReactNode } from 'react';
import { secureSessionStorage } from '../services/secure-session';
import { displayLocale } from './demo-state';
import { deviceLocale } from './controller/useLocalActions';
import { ModelSetupScreen } from './screens/ModelSetupScreen';
import { useModelAssets } from './useModelAssets';

export function ModelSetupGate({ children }: { children: ReactNode }) {
  const assets = useModelAssets();
  const [locale, setLocale] = useState(() => displayLocale('system', deviceLocale()));
  useEffect(() => {
    let live = true;
    void secureSessionStorage.getItem('chroma-locale-preference').then(value => {
      if (live && (value === 'system' || value === 'ko' || value === 'en')) setLocale(displayLocale(value, deviceLocale()));
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return assets.state.status === 'ready' ? <>{children}</> : <ModelSetupScreen locale={locale} {...assets} />;
}
