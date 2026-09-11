import { createChunkedSessionStorage, type SessionKeyValueStore } from './secure-session-core.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class MemoryStore implements SessionKeyValueStore {
  readonly values = new Map<string, string>();
  failNextSet = false;
  failNextRemove = false;

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('simulated write failure');
    }
    this.values.set(key, value);
  }

  async removeItem(key: string) {
    if (this.failNextRemove) {
      this.failNextRemove = false;
      throw new Error('simulated removal failure');
    }
    this.values.delete(key);
  }
}

const backing = new MemoryStore();
const storage = createChunkedSessionStorage(backing);
const largeSession = 'x'.repeat(4_096);

await storage.setItem('session', largeSession);
assert(await storage.getItem('session') === largeSession, 'large sessions must round-trip');
assert([...backing.values.values()].filter((value) => value === largeSession).length === 0, 'large sessions must be chunked');
assert([...backing.values.values()].every((value) => new TextEncoder().encode(value).length <= 1_500 || value.includes('"chunks"')), 'chunks must stay below the SecureStore bound');

await storage.setItem('session', 'previous');
backing.failNextSet = true;
await storage.setItem('session', 'replacement').catch(() => undefined);
assert(await storage.getItem('session') === 'previous', 'a failed replacement must keep the active session');

backing.failNextRemove = true;
await storage.removeItem('session').catch(() => undefined);
assert(await storage.getItem('session') === 'previous', 'a failed pointer removal must keep the active session');

await storage.removeItem('session');
assert(await storage.getItem('session') === null, 'removal must clear the active session');
