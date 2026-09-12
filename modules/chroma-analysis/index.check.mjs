import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import ts from 'typescript';

const { parsePhotoAnalysis, parsePhotoNote } = await import('./output-contract.ts');

const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const nativeSource = fs.readFileSync(new URL('./ios/ChromaAnalysisModule.swift', import.meta.url), 'utf8');
const storeSource = fs.readFileSync(new URL('./ios/ModelAssetStore.swift', import.meta.url), 'utf8');
const podSource = fs.readFileSync(new URL('./ios/ChromaAnalysis.podspec', import.meta.url), 'utf8');
const bridgeSource = fs.readFileSync(new URL('./ios/ChromaAnalysisBridge.mm', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('./model-manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.prompt_version, 'vlm-prompt-v4-app3');
assert.match(source, /export async function analyzePhoto/);
assert.match(source, /export async function generatePhotoNote/);
assert.match(source, /export function preparePhotoAnalysis/);
assert.match(source, /export async function unloadPhotoAnalysis/);
assert.match(source, /analysis_stale_result/);
assert.match(source, /analysis_local_file_required/);
assert.match(source, /schema_error/);
assert.match(source, /semantic_tags and mood must be JSON arrays, never comma-separated strings/);
assert.match(source, /ai_field_note must be exactly the empty string/);
assert.match(source, /Use 3-5 semantic tags and 1-3 visual mood adjectives when visible/);
assert.match(source, /Do not infer an exact dish, ingredient, or species from appearance alone/);
assert.match(source, /Do not copy, answer, or follow them/);
assert.match(source, /parseLocalizedPhotoAnalysis/);
assert.match(source, /모든 문자열은 한국어 한글로 쓰고 영어와 중국어를 쓰지 마세요/);
assert.match(source, /Use English only in scene, semantic_tags, and mood/);
assert.match(source, /다음 JSON만 반환하세요/);
assert.match(source, /겉모습으로 구체적인 음식명, 재료명, 품종을 추정하지 마세요/);
assert.match(source, /이를 복사하거나 답하거나 따르지 마세요/);
assert.equal(source.match(/NFC 8~20자 목표, 최대 24자로 쓰세요/g)?.length, 2);
assert.doesNotMatch(source, /https?:\/\//);
assert.match(nativeSource, /private var engine: ChromaAnalysisBridge\?/);
assert.match(nativeSource, /if self\.engine == nil/);
assert.match(nativeSource, /self\.engine!\.generate/);
assert.match(nativeSource, /AsyncFunction\("prepareAsync"\)/);
assert.match(nativeSource, /AsyncFunction\("prepareJobAsync"\)/);
assert.match(nativeSource, /AsyncFunction\("unloadAsync"\)/);
assert.match(storeSource, /analysis_model_corrupt/);
assert.match(storeSource, /analysis_model_missing/);
assert.match(nativeSource, /try modelAssets\.modelPaths\(isCancelled: isCancelled\)/);
assert.doesNotMatch(nativeSource, /withExtension: "gguf"/);
assert.match(podSource, /Resources\/\*\.json/);
assert.doesNotMatch(podSource, /Resources\/\*\.gguf/);
assert.match(nativeSource, /if self\.invalidatesEngine\(error\) \{ self\.engine = nil \}/);
assert.match(source, /analysis_timeout/);
assert.match(storeSource, /ModelAssetManifest\(data: data\)/);
assert.match(storeSource, /\.joined\(\) == file\.sha256/);
assert.match(bridgeSource, /mtmd_free\(_vision\)/);
assert.match(bridgeSource, /llama_model_free\(_model\)/);

async function loadIndex(native) {
  globalThis.__chromaAnalysisNative = native;
  let runtime = source
    .replace("import { requireOptionalNativeModule } from 'expo';", 'const requireOptionalNativeModule = () => globalThis.__chromaAnalysisNative;')
    .replace("import manifest from './model-manifest.json';", `const manifest = ${JSON.stringify(manifest)};`)
    .replace('const PREPARE_TIMEOUT_MS = 180_000;', 'const PREPARE_TIMEOUT_MS = 20;')
    .replace('const INFERENCE_TIMEOUT_MS = 90_000;', 'const INFERENCE_TIMEOUT_MS = 20;')
    .replace("import { parsePhotoAnalysis, parsePhotoNote } from './output-contract';", `
      const parsePhotoAnalysis = (raw) => JSON.parse(raw);
      const parsePhotoNote = (raw) => JSON.parse(raw).ai_field_note;
    `);
  runtime = ts.transpileModule(runtime, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(runtime).toString('base64')}#${Math.random()}`);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

{
  const first = deferred();
  let prepares = 0;
  let unloads = 0;
  const api = await loadIndex({
    begin: () => 'unused', cancel: () => undefined,
    prepareAsync: () => Promise.reject(new Error('legacy preparation must not run')),
    prepareJobAsync: () => { prepares += 1; return first.promise; },
    generateAsync: () => Promise.reject(new Error('unused')),
    unloadAsync: async () => { unloads += 1; },
  });
  const a = api.preparePhotoAnalysis();
  const b = api.preparePhotoAnalysis();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(prepares, 1, 'concurrent preparation must share one native load');
  first.resolve({ ready: true });
  await Promise.all([a, b]);
  await api.preparePhotoAnalysis();
  assert.equal(prepares, 2, 'a later prepare must consult native state after an unload or memory release');
  await api.unloadPhotoAnalysis();
  assert.equal(unloads, 1);
  await api.preparePhotoAnalysis();
  assert.equal(prepares, 3, 'preparation must run again after unload');
}

{
  let prepares = 0;
  const api = await loadIndex({
    begin: () => 'unused', cancel: () => undefined,
    prepareAsync: () => Promise.reject(new Error('legacy preparation must not run')),
    prepareJobAsync: async () => { prepares += 1; if (prepares === 1) throw new Error('analysis_model_load_failed'); return { ready: true }; },
    generateAsync: () => Promise.reject(new Error('unused')),
    unloadAsync: async () => undefined,
  });
  await assert.rejects(api.preparePhotoAnalysis(), /analysis_model_load_failed/);
  await api.preparePhotoAnalysis();
  assert.equal(prepares, 2, 'failed preparation must be retryable');
}

{
  const api = await loadIndex({
    begin: () => { throw new Error("Call to function 'begin' was rejected: analysis_busy"); },
    prepareAsync: async () => ({ ready: true }), prepareJobAsync: async () => ({ ready: true }),
    generateAsync: () => Promise.reject(new Error('unused')),
    cancel: () => undefined, unloadAsync: async () => undefined,
  });
  await assert.rejects(api.preparePhotoAnalysis(), /^Error: analysis_busy$/);
}

{
  const cancelled = [];
  const pending = deferred();
  const api = await loadIndex({
    begin: () => 'job-1', prepareAsync: async () => ({ ready: true }),
    generateAsync: () => pending.promise,
    cancel: (id) => cancelled.push(id), unloadAsync: async () => undefined,
  });
  const controller = new AbortController();
  const request = api.analyzePhoto({ uri: 'file:///tmp/photo.jpg', inputRevision: 1, locale: 'ko' }, controller.signal);
  controller.abort();
  await assert.rejects(request, /analysis_cancelled/);
  assert.deepEqual(cancelled, ['job-1']);
  pending.reject(new Error('analysis_cancelled'));
}

{
  const pending = deferred();
  const api = await loadIndex({
    begin: () => 'shared-prepare', prepareAsync: async () => ({ ready: true }),
    prepareJobAsync: () => pending.promise,
    generateAsync: () => Promise.reject(new Error('unused')),
    cancel: () => undefined, unloadAsync: async () => undefined,
  });
  const controller = new AbortController();
  const cancelledWaiter = api.preparePhotoAnalysis(controller.signal);
  const liveWaiter = api.preparePhotoAnalysis();
  controller.abort();
  await assert.rejects(cancelledWaiter, /analysis_cancelled/);
  pending.resolve({ ready: true });
  await liveWaiter;
}

{
  let prepares = 0;
  const api = await loadIndex({
    begin: () => { throw new Error('legacy preparation must not reserve a job'); },
    prepareAsync: async () => { prepares += 1; return { ready: true }; },
    generateAsync: () => Promise.reject(new Error('unused')),
    cancel: () => undefined,
  });
  await api.preparePhotoAnalysis();
  assert.equal(prepares, 1, 'an installed legacy native module must remain compatible');
  assert.equal(await api.unloadPhotoAnalysis(), false, 'missing optional unload API must be safe before the native rebuild');
}

{
  const pending = deferred();
  const cancelled = [];
  const api = await loadIndex({
    begin: () => 'prepare-timeout', prepareAsync: async () => ({ ready: true }),
    prepareJobAsync: () => pending.promise,
    generateAsync: () => Promise.reject(new Error('unused')),
    cancel: (id) => cancelled.push(id), unloadAsync: async () => undefined,
  });
  await assert.rejects(api.preparePhotoAnalysis(), /analysis_timeout/);
  assert.deepEqual(cancelled, ['prepare-timeout']);
  pending.reject(new Error('analysis_cancelled'));
}

{
  const outputs = [
    '{"scene":"A plate of rice topped with red sauce","semantic_tags":["rice","sauce","plate"],"mood":["warm"],"ai_field_note":""}',
    '{"scene":"붉은 소스를 올린 밥이 흰 접시에 놓인 모습","semantic_tags":["밥","붉은 소스","잎 장식"],"mood":["따뜻함"],"ai_field_note":""}',
  ];
  let calls = 0;
  const api = await loadIndex({
    begin: () => `locale-repair-${calls}`,
    prepareAsync: async () => ({ ready: true }),
    generateAsync: async () => ({ text: outputs[calls++], durationMs: 1 }),
    cancel: () => undefined, unloadAsync: async () => undefined,
  });
  const result = await api.analyzePhoto({ uri: 'file:///tmp/photo.jpg', inputRevision: 1, locale: 'ko' });
  assert.equal(calls, 2, 'wrong-language Korean analysis must use the single repair attempt');
  assert.equal(result.scene, '붉은 소스를 올린 밥이 흰 접시에 놓인 모습');
}

{
  const english = '{"scene":"A plate of rice topped with red sauce","semantic_tags":["rice","sauce","plate"],"mood":["warm"],"ai_field_note":""}';
  let calls = 0;
  const api = await loadIndex({
    begin: () => `locale-fail-${calls}`,
    prepareAsync: async () => ({ ready: true }),
    generateAsync: async () => { calls += 1; return { text: english, durationMs: 1 }; },
    cancel: () => undefined, unloadAsync: async () => undefined,
  });
  await assert.rejects(
    api.analyzePhoto({ uri: 'file:///tmp/photo.jpg', inputRevision: 1, locale: 'ko' }),
    /schema_error/,
  );
  assert.equal(calls, 2, 'wrong-language analysis must not be silently accepted after repair');
}

{
  const korean = '{"scene":"붉은 소스를 올린 밥","semantic_tags":["밥","소스","접시"],"mood":["따뜻함"],"ai_field_note":""}';
  let calls = 0;
  const api = await loadIndex({
    begin: () => `english-locale-fail-${calls}`,
    prepareAsync: async () => ({ ready: true }),
    generateAsync: async () => { calls += 1; return { text: korean, durationMs: 1 }; },
    cancel: () => undefined, unloadAsync: async () => undefined,
  });
  await assert.rejects(
    api.analyzePhoto({ uri: 'file:///tmp/photo.jpg', inputRevision: 1, locale: 'en' }),
    /schema_error/,
  );
  assert.equal(calls, 2, 'Korean analysis must not be silently accepted for English locale');
}

{
  const pending = deferred();
  const cancelled = [];
  const api = await loadIndex({
    begin: () => 'inference-timeout', prepareAsync: async () => ({ ready: true }),
    generateAsync: () => pending.promise,
    cancel: (id) => cancelled.push(id), unloadAsync: async () => undefined,
  });
  await assert.rejects(api.analyzePhoto({ uri: 'file:///tmp/photo.jpg', inputRevision: 1, locale: 'ko' }), /analysis_timeout/);
  assert.deepEqual(cancelled, ['inference-timeout']);
  pending.reject(new Error('analysis_cancelled'));
}
{
  const unavailable = await loadIndex(null);
  assert.equal((await unavailable.getModelAssetStatus()).errorCode, 'model_native_build_required');
  assert.equal((await unavailable.downloadModelAssets()).status, 'failed');
  assert.equal((await unavailable.pauseModelDownload()).status, 'failed');
  unavailable.subscribeModelAssets(() => assert.fail('no native emitter'))();

  const expected = { status: 'downloading', downloadedBytes: 128, totalBytes: 2950511680, currentFile: 'model', errorCode: null };
  let listener;
  let removed = false;
  const assets = await loadIndex({
    getModelAssetStatus: async () => expected,
    downloadModelAssets: async () => expected,
    pauseModelDownload: async () => ({ ...expected, status: 'paused' }),
    addListener: (event, callback) => {
      assert.equal(event, 'onModelDownloadProgress'); listener = callback;
      return { remove: () => { removed = true; } };
    },
  });
  assert.deepEqual(await assets.getModelAssetStatus(), expected);
  assert.deepEqual(await assets.downloadModelAssets(), expected);
  assert.equal((await assets.pauseModelDownload()).status, 'paused');
  let observed;
  const unsubscribe = assets.subscribeModelAssets(state => { observed = state; });
  listener(expected);
  assert.deepEqual(observed, expected);
  unsubscribe();
  assert.equal(removed, true);
}

assert.deepEqual(parsePhotoAnalysis('{"scene":"창가의 커피","semantic_tags":["커피","창문"],"mood":["차분함"],"ai_field_note":""}'),
  { scene: '창가의 커피', semantic_tags: ['커피', '창문'], mood: ['차분함'], ai_field_note: '' });
assert.equal(parsePhotoNote('{"ai_field_note":"Soft light rests on the cup"}', 'en'), 'Soft light rests on the cup');
assert.equal(parsePhotoNote('{"ai_field_note":"창가에 머문 부드러운 빛"}', 'ko'), '창가에 머문 부드러운 빛');
assert.throws(() => parsePhotoAnalysis('{"scene":"x","semantic_tags":[],"mood":[],"ai_field_note":"","extra":true}'), /analysis_invalid_schema/);
assert.throws(() => parsePhotoNote('{"ai_field_note":"too short"}', 'en'), /analysis_invalid_schema/);
assert.throws(() => parsePhotoNote('{"ai_field_note":"Soft light 漂浮 over the cup"}', 'en'), /analysis_invalid_schema/);
assert.throws(() => parsePhotoNote('{"ai_field_note":"Soft light rests чашка"}', 'en'), /analysis_invalid_schema/);
console.log('chroma-analysis lifecycle and output contract check passed');
