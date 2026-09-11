export type StructuredPhotoAnalysis = Readonly<{
  scene: string | null;
  semantic_tags: string[];
  mood: string[];
  ai_field_note: '';
}>;

const codePoints = (text: string) => Array.from(text).length;
const url = /\b(?:https?|file):\/\//i;

function invalid(): never {
  throw new Error('analysis_invalid_schema');
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== [...keys].sort()[index])) invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value !== value.normalize('NFC') || codePoints(value) > max || /[\r\n]/.test(value) || url.test(value)) invalid();
  return value;
}

function tags(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) invalid();
  const result = value.map((item) => text(item, 24));
  if (new Set(result).size !== result.length) invalid();
  return result;
}

function json(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return invalid(); }
}

export function parsePhotoAnalysis(raw: string): StructuredPhotoAnalysis {
  const value = object(json(raw), ['scene', 'semantic_tags', 'mood', 'ai_field_note']);
  const scene = value.scene === null ? null : text(value.scene, 120);
  const aiFieldNote = value.ai_field_note;
  if (aiFieldNote !== '') invalid();
  return { scene, semantic_tags: tags(value.semantic_tags, 8), mood: tags(value.mood, 3), ai_field_note: '' };
}

export function parsePhotoNote(raw: string, locale: string): string {
  const value = object(json(raw), ['ai_field_note']);
  const note = text(value.ai_field_note, 60);
  if (locale === 'ko') {
    if (codePoints(note) < 8 || codePoints(note) > 24 || !/[가-힣]/.test(note)) invalid();
  } else if (locale === 'en') {
    const words = note.split(/\s+/);
    if (words.length < 4 || words.length > 8 || /[가-힣]/.test(note)) invalid();
  } else {
    invalid();
  }
  return note;
}
