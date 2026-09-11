export interface SessionKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface SessionPointer {
  id: string;
  chunks: number;
}

const CHUNK_BYTES = 1_500;
const MAX_CHUNKS = 64;

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function splitIntoChunks(value: string) {
  const chunks: string[] = [];
  let chunk = '';
  let chunkBytes = 0;

  for (const character of value) {
    const characterBytes = byteLength(character);
    if (chunkBytes + characterBytes > CHUNK_BYTES) {
      chunks.push(chunk);
      chunk = '';
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
  }
  chunks.push(chunk);

  if (chunks.length > MAX_CHUNKS) throw new Error('Session is too large to store securely.');
  return chunks;
}

function createId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function pointerKey(key: string) {
  return `${key}.active`;
}

function chunkKey(key: string, pointer: SessionPointer, index: number) {
  return `${key}.${pointer.id}.${index}`;
}

function parsePointer(value: string | null): SessionPointer | null {
  if (!value) return null;
  try {
    const pointer = JSON.parse(value) as Partial<SessionPointer>;
    return typeof pointer.id === 'string' && /^[a-z0-9]+$/.test(pointer.id)
      && typeof pointer.chunks === 'number' && Number.isInteger(pointer.chunks)
      && pointer.chunks > 0 && pointer.chunks <= MAX_CHUNKS
      ? { id: pointer.id, chunks: pointer.chunks }
      : null;
  } catch {
    return null;
  }
}

export function createChunkedSessionStorage(store: SessionKeyValueStore): SessionKeyValueStore {
  let pending = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>) => {
    const result = pending.then(operation, operation);
    pending = result.then(() => undefined, () => undefined);
    return result;
  };

  const readPointer = async (key: string) => parsePointer(await store.getItem(pointerKey(key)));
  const removeChunks = async (key: string, pointer: SessionPointer) => {
    await Promise.all(Array.from({ length: pointer.chunks }, (_, index) => store.removeItem(chunkKey(key, pointer, index)).catch(() => undefined)));
  };

  return {
    getItem: (key) => serial(async () => {
      const pointer = await readPointer(key);
      if (!pointer) return null;

      const chunks = await Promise.all(Array.from({ length: pointer.chunks }, (_, index) => store.getItem(chunkKey(key, pointer, index))));
      if (chunks.some((chunk) => chunk === null)) {
        await store.removeItem(pointerKey(key)).catch(() => undefined);
        await removeChunks(key, pointer);
        return null;
      }
      return chunks.join('');
    }),

    setItem: (key, value) => serial(async () => {
      const previous = await readPointer(key);
      const chunks = splitIntoChunks(value);
      const pointer = { id: createId(), chunks: chunks.length };
      const written: number[] = [];

      try {
        for (const [index, chunk] of chunks.entries()) {
          await store.setItem(chunkKey(key, pointer, index), chunk);
          written.push(index);
        }
        await store.setItem(pointerKey(key), JSON.stringify(pointer));
      } catch (error) {
        await Promise.all(written.map((index) => store.removeItem(chunkKey(key, pointer, index)).catch(() => undefined)));
        throw error;
      }

      if (previous) await removeChunks(key, previous);
    }),

    removeItem: (key) => serial(async () => {
      const pointer = await readPointer(key);
      await store.removeItem(pointerKey(key));
      if (pointer) await removeChunks(key, pointer);
    }),
  };
}

export function createWebSessionStorage(): SessionKeyValueStore {
  const memory = new Map<string, string>();
  const storage = typeof sessionStorage === 'undefined' ? null : sessionStorage;
  return {
    async getItem(key) {
      try {
        return storage?.getItem(key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    async setItem(key, value) {
      if (!storage) {
        memory.set(key, value);
        return;
      }
      try {
        storage.setItem(key, value);
      } catch {
        memory.set(key, value);
      }
    },
    async removeItem(key) {
      memory.delete(key);
      try {
        storage?.removeItem(key);
      } catch {
        // Browser storage can be disabled; its in-memory fallback is already cleared.
      }
    },
  };
}
