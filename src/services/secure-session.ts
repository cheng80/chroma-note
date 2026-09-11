import { createWebSessionStorage } from './secure-session-core';

export * from './secure-session-core';

// TypeScript and non-Expo callers resolve this safe, session-only fallback.
export const secureSessionStorage = createWebSessionStorage();
