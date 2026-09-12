import type { RecordFields } from './contract.ts';

/** Empty edited text explicitly hides the legacy AI source; preserve all other text verbatim. */
export function recordWriting(fields: Pick<RecordFields, 'user_note' | 'ai_field_note' | 'ai_field_note_edited'>): string {
  return [fields.user_note, fields.ai_field_note_edited ?? fields.ai_field_note].filter(value => value !== '').join('\n\n');
}
