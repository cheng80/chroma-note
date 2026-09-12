import * as SecureStore from 'expo-secure-store';

import { createChunkedSessionStorage } from './secure-session-core';

const deviceOnly = { keychainService: 'chroma-note.device-only', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const pendingLegacyCleanup = new Set<string>();

async function removeLegacyItem(key: string) {
  pendingLegacyCleanup.add(key);
  try {
    await SecureStore.deleteItemAsync(key);
    pendingLegacyCleanup.delete(key);
  } catch { /* A committed device-only value remains authoritative; retry on later access. */ }
}

async function retryLegacyCleanup() {
  await Promise.all([...pendingLegacyCleanup].map(removeLegacyItem));
}

export const secureSessionStorage = createChunkedSessionStorage({
  async getItem(key) {
    await retryLegacyCleanup();
    const current = await SecureStore.getItemAsync(key, deviceOnly);
    if (current !== null) {
      await removeLegacyItem(key);
      return current;
    }
    const legacy = await SecureStore.getItemAsync(key);
    if (legacy === null) return null;
    await SecureStore.setItemAsync(key, legacy, deviceOnly);
    await removeLegacyItem(key);
    return legacy;
  },
  async setItem(key, value) {
    await retryLegacyCleanup();
    await SecureStore.setItemAsync(key, value, deviceOnly);
    await removeLegacyItem(key);
  },
  async removeItem(key) {
    await retryLegacyCleanup();
    const results = await Promise.allSettled([
      SecureStore.deleteItemAsync(key, deviceOnly),
      SecureStore.deleteItemAsync(key).then(() => pendingLegacyCleanup.delete(key), (error) => {
        pendingLegacyCleanup.add(key);
        throw error;
      }),
    ]);
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure) throw failure.reason;
  },
});
