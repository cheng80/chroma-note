import assert from 'node:assert/strict';
import fs from 'node:fs';

const { parsePhotoAnalysis, parsePhotoNote } = await import('./output-contract.ts');

const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const nativeSource = fs.readFileSync(new URL('./ios/ChromaAnalysisModule.swift', import.meta.url), 'utf8');
assert.match(source, /export async function analyzePhoto/);
assert.match(source, /export async function generatePhotoNote/);
assert.match(source, /export function preparePhotoAnalysis/);
assert.match(source, /analysis_stale_result/);
assert.match(source, /analysis_local_file_required/);
assert.match(source, /schema_error/);
assert.match(source, /semantic_tags and mood must be JSON arrays, never comma-separated strings/);
assert.match(source, /Use 3-5 semantic tags and 1-3 mood tags when visible/);
assert.match(source, /JSON만 반환하세요/);
assert.match(source, /한국어 문구 한 개를 NFC 8~24자로 쓰세요/);
assert.doesNotMatch(source, /https?:\/\//);
assert.match(nativeSource, /private var engine: ChromaAnalysisBridge\?/);
assert.match(nativeSource, /if self\.engine == nil/);
assert.match(nativeSource, /self\.engine!\.generate/);
assert.match(nativeSource, /AsyncFunction\("prepareAsync"\)/);
assert.deepEqual(parsePhotoAnalysis('{"scene":"창가의 커피","semantic_tags":["커피","창문"],"mood":["차분함"],"ai_field_note":""}'),
  { scene: '창가의 커피', semantic_tags: ['커피', '창문'], mood: ['차분함'], ai_field_note: '' });
assert.equal(parsePhotoNote('{"ai_field_note":"Soft light rests on the cup"}', 'en'), 'Soft light rests on the cup');
assert.equal(parsePhotoNote('{"ai_field_note":"창가에 머문 부드러운 빛"}', 'ko'), '창가에 머문 부드러운 빛');
assert.throws(() => parsePhotoAnalysis('{"scene":"x","semantic_tags":[],"mood":[],"ai_field_note":"","extra":true}'), /analysis_invalid_schema/);
assert.throws(() => parsePhotoNote('{"ai_field_note":"too short"}', 'en'), /analysis_invalid_schema/);
console.log('chroma-analysis output contract check passed');
