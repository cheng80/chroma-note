import type { Draft, DemoOwnerId, SaveAttempt } from '../domain/record';

export interface DraftState {
  drafts: { new: Draft | null; edit: Draft | null };
  save_attempt: SaveAttempt | null;
}

const prefix = 'chroma-note.drafts.limited.';

export async function drainDraftCleanup(_ownerId: string): Promise<void> {
  // Web never owns native working files.
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stripImageCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripImageCredentials);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    if (key === 'image_headers' || key === 'signed_url' || key === 'signedUrl') return [];
    if (key === 'local_uri' && typeof child === 'string' && /[?&](token|signature|expires)=/i.test(child)) return [];
    return [[key, stripImageCredentials(child)]];
  }));
}

function recover(state: DraftState): DraftState {
  const drafts = clone(state.drafts);
  for (const draft of Object.values(drafts)) {
    if (draft && ['preparing', 'colors', 'analysis', 'stamp', 'processing'].includes(draft.stage)) {
      draft.stage = 'interrupted';
      draft.error_code = 'interrupted';
    }
  }
  const save_attempt = state.save_attempt ? clone(state.save_attempt) : null;
  if (save_attempt && ['pending', 'uploading', 'finalizing'].includes(save_attempt.state)) {
    save_attempt.state = 'uncertain';
    save_attempt.error_code = 'save_uncertain';
  }
  return { drafts, save_attempt };
}

function belongsTo(ownerId: DemoOwnerId, state: DraftState) {
  return Object.values(state.drafts).every((draft) => !draft || draft.owner_id === ownerId)
    && (!state.save_attempt || state.save_attempt.owner_id === ownerId);
}

function storage() {
  try { return sessionStorage; } catch { return null; }
}

export async function readDraftState(ownerId: DemoOwnerId): Promise<DraftState | null> {
  try {
    const raw = storage()?.getItem(`${prefix}${ownerId}`);
    if (!raw) return null;
    const state = JSON.parse(raw) as DraftState;
    return state?.drafts && belongsTo(ownerId, state) ? recover(state) : null;
  } catch {
    return null;
  }
}

export async function writeDraftState(ownerId: DemoOwnerId, state: DraftState): Promise<void> {
  const safe = clone(state);
  if (!belongsTo(ownerId, safe)) throw new Error('Draft state belongs to another account.');
  if (safe.save_attempt && ['saved', 'demo_saved'].includes(safe.save_attempt.state)) safe.save_attempt = null;
  const target = storage();
  if (!target) throw new Error('Web draft storage is unavailable.');
  target.setItem(`${prefix}${ownerId}`, JSON.stringify(stripImageCredentials(safe)));
}

export async function clearDraftState(ownerId: DemoOwnerId): Promise<void> {
  const target = storage();
  if (!target) throw new Error('Web draft storage is unavailable.');
  target.removeItem(`${prefix}${ownerId}`);
}
