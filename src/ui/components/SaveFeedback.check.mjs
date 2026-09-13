import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const slots = [], dependencies = [], cleanups = [], pending = [], timers = new Map();
let index = 0, timerId = 0;
const hooks = {
  ...React,
  useRef(initial) { const slot = index++; return slots[slot] ??= { current: initial }; },
  useState(initial) {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = initial;
    return [slots[slot], value => { slots[slot] = value; }];
  },
  useEffect(effect, deps) {
    const slot = index++;
    if (!dependencies[slot] || deps.some((dep, i) => !Object.is(dep, dependencies[slot][i]))) {
      pending.push(() => { cleanups[slot]?.(); cleanups[slot] = effect(); });
    }
    dependencies[slot] = deps;
  },
};
const modules = {
  react: hooks,
  'react-native': { View: 'View', StyleSheet: { create: value => value } },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 44, left: 0, right: 0 }) },
  '../theme': { theme: { spacing: { sm: 8, lg: 16 }, contentMaxWidth: 540 } },
  './Notice': { Notice: 'Notice' },
};
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./SaveFeedback.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require: name => {
  assert.ok(name in modules, `Unexpected dependency: ${name}`);
  return modules[name];
}, setTimeout: (callback, delay) => {
  assert.equal(delay, 2600);
  timers.set(++timerId, callback);
  return timerId;
}, clearTimeout: id => timers.delete(id) });
const attempt = (state, owner_id = 'a', operation_id = 'op') => ({ owner_id, operation_id, state });
const draw = (value, ownerId = 'a', locale = 'ko') => {
  index = 0;
  return exports.SaveFeedback({ attempt: value, ownerId, locale });
};
const render = (value, ownerId = 'a', locale = 'ko') => {
  let output = draw(value, ownerId, locale);
  while (pending.length) {
    pending.splice(0).forEach(effect => effect());
    output = draw(value, ownerId, locale);
  }
  return output;
};
assert.equal(render(attempt('saved')), null, 'already saved on launch stays silent');
assert.equal(render(null), null);
for (const state of ['pending', 'uploading', 'finalizing', 'failed', 'uncertain', 'conflict', 'demo_saved']) {
  assert.equal(render(attempt(state)), null, `${state} is not a real save confirmation`);
}
render(attempt('pending'));
const shown = render(attempt('saved'));
assert.equal(shown.props.pointerEvents, 'none');
assert.equal(shown.props.style[1].top, 52, 'notice clears the top safe area');
assert.equal(shown.props.children.props.tone, 'success');
assert.equal(timers.size, 1);
const firstTimer = timerId;
render(attempt('saved'), 'a', 'en');
assert.equal(timerId, firstTimer, 'same saved attempt and locale changes do not restart the timer');
timers.get(firstTimer)();
timers.delete(firstTimer);
assert.equal(render(attempt('saved')), null, 'notice expires after 2.6 seconds');
render(attempt('pending'));
assert.equal(render(attempt('saved', 'a', 'other')), null, 'different operation cannot trigger success');
render(attempt('pending'));
assert.equal(render(attempt('saved', 'b'), 'b'), null, 'account change cannot trigger success');
render(attempt('pending', 'b'), 'b');
assert.ok(render(attempt('saved', 'b'), 'b'));
assert.equal(draw(attempt('saved', 'a'), 'a'), null, 'cross-account notice is hidden before effects run');
render(attempt('saved', 'a'), 'a');
assert.equal(timers.size, 0, 'account change cancels the old timer');
render(attempt('pending'), null);
assert.equal(render(attempt('saved'), 'a'), null, 'restoration must not look like a save transition');
render(attempt('pending'));
assert.ok(render(attempt('saved')));
cleanups.forEach(cleanup => cleanup?.());
assert.equal(timers.size, 0, 'unmount cancels the timer');
console.log('SaveFeedback.check passed: actual save transition, restoration, account/operation isolation, expiry and cleanup');
