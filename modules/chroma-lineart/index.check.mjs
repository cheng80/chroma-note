// JS/native contract only; actual Core ML inference is checked by tests/.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const stub = 'data:text/javascript,export function requireOptionalNativeModule(){ return globalThis.__lineArtCheckNative; }';
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === 'expo' ? { url: stub, shortCircuit: true } : nextResolve(specifier, context);
} });
const { convertLineArt } = await import('./index.ts');
const calls = [];
let finish;
globalThis.__lineArtCheckNative = {
  begin() { calls.push('begin'); return 'job'; },
  convertAsync(...args) { calls.push(args); return new Promise(resolve => { finish = resolve; }); },
  cancel(id) { calls.push(['cancel', id]); },
  async discardResult(uri) { calls.push(['discard', uri]); },
};
const input = { uri: 'file:///private/photo.jpg', outputDirectory: 'file:///private/draft', inputRevision: 1 };
const result = { uri: 'file:///private/draft/lineart-job.png', width: 100, height: 80, bytes: 2048, durationMs: 20 };
try {
  const pending = convertLineArt(input, { lineGain: 2 });
  input.inputRevision = 2;
  finish(result);
  assert.deepEqual(await pending, { ...result, inputRevision: 1, options: { maxEdge: 1024, lineGain: 2 } });
  assert.deepEqual(calls[1], ['job', input.uri, input.outputDirectory, { maxEdge: 1024, lineGain: 2 }]);
  calls.length = 0;
  for (const bad of [{ ...input, uri: 'https://example.invalid/photo.jpg' }, { ...input, inputRevision: 0 }, { ...input, outputDirectory: 'file:///private/draft#fragment' }]) {
    await assert.rejects(convertLineArt(bad));
  }
  const before = new AbortController(); before.abort();
  await assert.rejects(convertLineArt(input, {}, before.signal), /cancelled/);
  assert.equal(calls.length, 0, 'invalid or already-cancelled requests must not start native work');
  const during = new AbortController();
  const cancelled = convertLineArt(input, {}, during.signal);
  during.abort();
  finish(result);
  await assert.rejects(cancelled, /cancelled/);
  assert.deepEqual(calls.slice(-2), [['cancel', 'job'], ['discard', result.uri]]);
  calls.length = 0;
  const done = new AbortController();
  const successful = convertLineArt(input, {}, done.signal);
  finish(result); await successful; done.abort();
  assert.equal(calls.length, 2, 'abort listener removed after success');
  globalThis.__lineArtCheckNative = null;
  await assert.rejects(convertLineArt(input), /native_build_required/);
  console.log('line-art JS contract passed: input snapshot, forwarding, validation, cancellation, cleanup, missing native module');
} finally {
  hooks.deregister();
  delete globalThis.__lineArtCheckNative;
}
