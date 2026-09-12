import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const mock = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-secure-store') return { url: mock(`
      const stores = { app: new Map([['session.active', '{"id":"old","chunks":1}'], ['session.old.0', 'legacy']]), 'chroma-note.device-only': new Map() };
      const failures = { legacyDelete: new Set() };
      export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6;
      export const __testing = stores;
      export const __failures = failures;
      const store = (options = {}) => stores[options.keychainService ?? 'app'];
      export async function getItemAsync(key, options) { return store(options).get(key) ?? null; }
      export async function setItemAsync(key, value, options) {
        assert(options?.keychainAccessible === WHEN_UNLOCKED_THIS_DEVICE_ONLY);
        store(options).set(key, value);
      }
      export async function deleteItemAsync(key, options) {
        if (!options?.keychainService && failures.legacyDelete.has(key)) throw new Error('legacy delete failed');
        store(options).delete(key);
      }
      import assert from 'node:assert/strict';
    `), shortCircuit: true };
    if (specifier === './secure-session-core' && context.parentURL?.endsWith('/secure-session.native.ts')) {
      return { url: new URL('./secure-session-core.ts', context.parentURL).href, format: 'module-typescript', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { secureSessionStorage } = await import('./secure-session.native.ts');
const { __testing, __failures } = await import('expo-secure-store');

assert.equal(await secureSessionStorage.getItem('session'), 'legacy');
assert.equal(__testing.app.size, 0, 'legacy keychain items must be removed after migration');
assert(__testing['chroma-note.device-only'].size > 0, 'session must move to the device-only service');
await secureSessionStorage.setItem('session', 'replacement');
assert.equal(await secureSessionStorage.getItem('session'), 'replacement');
await secureSessionStorage.removeItem('session');
assert.equal(__testing.app.size + __testing['chroma-note.device-only'].size, 0, 'removal must clear both services');

__testing.app.set('resilient.active', '{"id":"legacy","chunks":1}');
__testing.app.set('resilient.legacy.0', 'old');
__failures.legacyDelete.add('resilient.active');
__failures.legacyDelete.add('resilient.legacy.0');
assert.equal(await secureSessionStorage.getItem('resilient'), 'old', 'migration must survive legacy pointer and chunk cleanup failures');
await secureSessionStorage.setItem('resilient', 'new');
assert.equal(await secureSessionStorage.getItem('resilient'), 'new', 'committed device-only pointer must survive legacy pointer cleanup failure');
const currentPointer = JSON.parse(__testing['chroma-note.device-only'].get('resilient.active'));
assert.equal(__testing['chroma-note.device-only'].get(`resilient.${currentPointer.id}.0`), 'new', 'committed device-only chunk must remain readable');
__failures.legacyDelete.clear();
assert.equal(await secureSessionStorage.getItem('resilient'), 'new');
assert.equal(__testing.app.size, 0, 'later reads must retry pending legacy cleanup');

console.log('secure-session.native.check passed');
