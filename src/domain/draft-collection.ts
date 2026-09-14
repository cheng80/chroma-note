import type { Draft, SaveAttempt } from './record';

export interface DraftCollection {
  new: Draft | null;
  edits: Record<string, Draft>;
}

export function listDrafts(drafts: DraftCollection): Draft[] {
  return drafts.new ? [drafts.new, ...Object.values(drafts.edits)] : Object.values(drafts.edits);
}

/** Unmarked edits are older saved work, preserved until explicitly opened or discarded. */
export function persistedDraftCollection(drafts: DraftCollection, saveAttempt: SaveAttempt | null): DraftCollection {
  const recoveryDraftId = saveAttempt && ['pending', 'uploading', 'finalizing', 'uncertain', 'failed', 'conflict'].includes(saveAttempt.state)
    ? saveAttempt.draft_id : null;
  return {
    new: drafts.new,
    edits: Object.fromEntries(Object.entries(drafts.edits).filter(([, draft]) =>
      draft.transient_edit !== true || draft.draft_id === recoveryDraftId)),
  };
}

export function putDraft(drafts: DraftCollection, draft: Draft): DraftCollection {
  return draft.kind === 'new'
    ? { ...drafts, new: draft }
    : { ...drafts, edits: { ...drafts.edits, [draft.record_id]: draft } };
}

export function removeDraft(drafts: DraftCollection, draft: Draft): DraftCollection {
  if (draft.kind === 'new') {
    return drafts.new?.draft_id === draft.draft_id ? { ...drafts, new: null } : drafts;
  }
  if (!Object.hasOwn(drafts.edits, draft.record_id) || drafts.edits[draft.record_id].draft_id !== draft.draft_id) return drafts;
  const edits = { ...drafts.edits };
  delete edits[draft.record_id];
  return { ...drafts, edits };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readDraft(value: unknown, kind: Draft['kind']): Draft {
  if (!isObject(value) || value.kind !== kind
    || typeof value.draft_id !== 'string' || !value.draft_id
    || typeof value.record_id !== 'string' || !value.record_id
    || typeof value.owner_id !== 'string' || !value.owner_id) {
    throw new Error('Invalid draft collection entry.');
  }
  return value as unknown as Draft;
}

/** Accept both persisted shapes without dropping an unrepresentable legacy draft. */
export function normalizeDraftCollection(value: unknown): DraftCollection {
  if (!isObject(value) || !Object.hasOwn(value, 'new')
    || (!Object.hasOwn(value, 'edit') && !Object.hasOwn(value, 'edits'))) {
    throw new Error('Invalid draft collection.');
  }
  const newDraft = value.new === null ? null : readDraft(value.new, 'new');
  let edits: Record<string, Draft> = {};
  if (Object.hasOwn(value, 'edits')) {
    if (!isObject(value.edits)) throw new Error('Invalid edit draft collection.');
    edits = Object.fromEntries(Object.entries(value.edits).map(([recordId, entry]) => {
      const draft = readDraft(entry, 'edit');
      if (recordId !== draft.record_id) throw new Error('Edit draft record ID mismatch.');
      return [recordId, draft];
    }));
  }
  if (Object.hasOwn(value, 'edit') && value.edit !== null) {
    const legacy = readDraft(value.edit, 'edit');
    if (Object.hasOwn(edits, legacy.record_id)) {
      // One slot cannot preserve two distinct snapshots, even with the same draft ID.
      if (JSON.stringify(edits[legacy.record_id]) !== JSON.stringify(legacy)) {
        throw new Error('Conflicting legacy edit draft.');
      }
    } else {
      edits = { ...edits, [legacy.record_id]: legacy };
    }
  }
  return { new: newDraft, edits };
}
