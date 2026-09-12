import type { DemoSession } from '../contract';
import type { ControllerStore } from './controller-store';

interface ReadRequest {
  session: DemoSession;
  revision: number;
  signal: AbortSignal;
}

/** Owns record operation ordering. Callers never read or release another task's lock. */
export function createRecordOperations(store: ControllerStore) {
  let revision = 0;
  let read = new AbortController();
  let mutation: { session: DemoSession } | null = null;
  let logout: { session: DemoSession } | null = null;
  const busy = () => Boolean(mutation && store.isCurrent(mutation.session));
  const savingForLogout = () => Boolean(logout && store.isCurrent(logout.session));
  const invalidate = () => { revision += 1; read.abort(); read = new AbortController(); };
  return {
    busy,
    savingForLogout,
    invalidate,
    reset() { invalidate(); mutation = null; logout = null; },
    acquire(session: DemoSession) {
      if (!store.isCurrent(session) || busy()) return null;
      const lease = { session };
      mutation = lease;
      invalidate();
      return () => {
        if (mutation !== lease) return false;
        mutation = null;
        return store.isCurrent(session);
      };
    },
    reserveLogout(session: DemoSession) {
      if (!store.isCurrent(session) || busy() || savingForLogout()) return null;
      const lease = { session };
      logout = lease;
      invalidate();
      return () => { if (logout === lease) logout = null; };
    },
    request(session: DemoSession, replace = false): ReadRequest | null {
      if (!store.isCurrent(session) || busy() || savingForLogout()) return null;
      if (replace) invalidate();
      return { session, revision, signal: read.signal };
    },
    accepts(request: ReadRequest) {
      return store.isCurrent(request.session) && request.revision === revision && !request.signal.aborted && !busy() && !savingForLogout();
    },
    isLatest(request: ReadRequest) {
      return store.isCurrent(request.session) && request.revision === revision;
    },
  };
}

export type RecordOperations = ReturnType<typeof createRecordOperations>;
