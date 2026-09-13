import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const calls = [], exports = {};
let release, controller;
const platform = { OS: 'ios' };
const code = ts.transpileModule(readFileSync(new URL('./photo-processing.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, performance, __DEV__: false, require(name) {
  const modules = {
    'react-native': { Platform: platform },
    'expo-file-system': { File: class { exists = true; }, Directory: class { uri = 'file:///draft'; create() {} }, Paths: { document: '' } },
    'expo-crypto': { randomUUID: () => 'result' },
    '../../modules/chroma-lineart': { convertLineArt: async () => { calls.push('convert'); return { options: {} }; } },
    '../../modules/chroma-lineart/model-manifest.json': { source: { author_weights: { revision: 'test' } } },
    '../../modules/chroma-lineart/palette': {},
    '../../modules/chroma-analysis': { unloadPhotoAnalysis: () => { calls.push('unload'); return new Promise(resolve => { release = resolve; }); } },
  };
  assert.ok(name in modules, name); return modules[name];
} });
const photo = { source: 'device', input_revision: 1, local_uri: 'file:///photo.jpg' };
const job = { step: 'stamp', input_revision: 1, owner_id: 'test' };
for (const [os, cancel] of [['ios', false], ['android', false], ['android', true]]) {
  platform.OS = os;
  calls.length = 0;
  controller = new AbortController();
  const result = exports.processPhotoStep(photo, job, 'ko', controller.signal);
  assert.deepEqual(calls, ['unload'], 'conversion must wait for VLM memory release');
  if (cancel) controller.abort();
  release(true);
  if (cancel) {
    await assert.rejects(result, /photo_cancelled/);
    assert.deepEqual(calls, ['unload'], 'cancelled work must not start sketch inference');
  } else {
    const completed = await result;
    assert.equal(completed.step, 'stamp');
    assert.equal(completed.stamp.processing.runtime_version, os === 'android' ? 'ONNXRuntime-1.24.3-Android' : 'CoreML-iOS17');
    assert.deepEqual(calls, ['unload', 'convert']);
  }
}
console.log('PASS sketch waits for VLM release and respects cancellation');
