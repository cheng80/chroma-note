import { recordWriting } from './record-writing.ts';

const cases = [
  ['', '', null, ''],
  ['내 글', '원문', null, '내 글\n\n원문'],
  ['내 글', '원문', '수정문', '내 글\n\n수정문'],
  ['내 글', '원문', '', '내 글'],
  ['', '원문', '', ''],
  ['', '원문', null, '원문'],
  ['내 글', '', null, '내 글'],
  [' \n내 글\n ', '원문', '\n 고친 글 \n', ' \n내 글\n \n\n\n 고친 글 \n'],
  [' ', '\n', null, ' \n\n\n'],
  ['e\u0301', '', null, 'e\u0301'],
] as const;

for (const [user_note, ai_field_note, ai_field_note_edited, expected] of cases) {
  const fields = Object.freeze({ user_note, ai_field_note, ai_field_note_edited });
  if (recordWriting(fields) !== expected) throw new Error(`recordWriting changed source text: ${JSON.stringify(fields)}`);
}
console.log('record-writing.check passed: legacy fallback, explicit clearing, whitespace, newlines, and original Unicode');
