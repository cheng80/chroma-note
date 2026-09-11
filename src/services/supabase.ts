import { AppState, type AppStateStatus, Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { secureSessionStorage } from './secure-session';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export class SupabaseConfigError extends Error {
  constructor() {
    super('Supabase is not configured. Add the public project URL and publishable key.');
    this.name = 'SupabaseConfigError';
  }
}

export const supabase: SupabaseClient | undefined = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: secureSessionStorage,
        storageKey: 'chroma-note.auth.session',
      },
    })
  : undefined;

export function getSupabase() {
  if (!supabase) throw new SupabaseConfigError();
  return supabase;
}

let autoRefreshReferences = 0;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | undefined;

function syncAutoRefresh(status: AppStateStatus) {
  const auth = getSupabase().auth;
  if (status === 'active') auth.startAutoRefresh();
  else auth.stopAutoRefresh();
}

export function startSessionRefresh() {
  if (Platform.OS === 'web' || !supabase) return () => undefined;

  autoRefreshReferences += 1;
  if (autoRefreshReferences === 1) {
    syncAutoRefresh(AppState.currentState);
    appStateSubscription = AppState.addEventListener('change', syncAutoRefresh);
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    autoRefreshReferences -= 1;
    if (autoRefreshReferences === 0) {
      appStateSubscription?.remove();
      appStateSubscription = undefined;
      getSupabase().auth.stopAutoRefresh();
    }
  };
}
