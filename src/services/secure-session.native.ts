import * as SecureStore from 'expo-secure-store';

import { createChunkedSessionStorage } from './secure-session-core';

export const secureSessionStorage = createChunkedSessionStorage({
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
});
