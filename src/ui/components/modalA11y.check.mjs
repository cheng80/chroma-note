import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./modalA11y.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const timers = [];
const focused = [];
const timer = (callback) => (timers.push({ callback, cleared: false }), timers.length - 1);
const clearTimer = (id) => { timers[id].cleared = true; };
const flush = () => {
  while (timers.some(item => !item.cleared && !item.ran)) {
    for (const item of timers) if (!item.cleared && !item.ran) { item.ran = true; item.callback(); }
  }
};

class Hooks {
  slots = [];
  index = 0;
  render(options) {
    this.index = 0;
    this.value = invokeHook(options);
    return this.value;
  }
  unmount() { for (const slot of this.slots) slot?.cleanup?.(); }
}
let active;
const react = {
  useRef(value) {
    const index = active.index++;
    return active.slots[index] ??= { current: value };
  },
  useCallback(callback) { active.index++; return callback; },
  useEffect(effect, deps) {
    const index = active.index++;
    const slot = active.slots[index];
    if (slot && deps.every((value, i) => Object.is(value, slot.deps[i]))) return;
    slot?.cleanup?.();
    active.slots[index] = { deps, cleanup: effect() };
  },
};
react.useLayoutEffect = react.useEffect;
const exports = {};
vm.runInNewContext(code, {
  exports,
  require: (name) => name === 'react' ? react : {
    Platform: { OS: 'ios' },
    AccessibilityInfo: { setAccessibilityFocus: handle => focused.push(handle) },
    findNodeHandle: target => target.handle,
  },
  setTimeout: timer,
  clearTimeout: clearTimer,
});
const invokeHook = exports.useModalA11y;
const ref = target => ({ current: target });
const render = (hooks, options) => { active = hooks; return hooks.render(options); };

const first = new Hooks();
const firstResult = render(first, { visible: true, initialFocusRef: ref({ handle: 1 }) });
flush();
assert.deepEqual(focused, [], 'initial focus waits for onShow');
firstResult.onShow();
assert.deepEqual(focused, [], 'onShow defers focus once');
flush();
assert.deepEqual(focused, [1], 'onShow focuses the initial target');
first.unmount();

focused.length = 0;
const cancelled = new Hooks();
const cancelledResult = render(cancelled, { visible: true, initialFocusRef: ref({ handle: 2 }) });
cancelledResult.onShow();
render(cancelled, { visible: false });
flush();
assert.deepEqual(focused, [], 'close cancels pending initial focus');

const restore = new Hooks();
render(restore, { visible: true, restoreFocusRef: ref({ handle: 3 }) });
render(restore, { visible: false });
flush();
assert.deepEqual(focused, [3], 'close restores focus');

focused.length = 0;
const changed = new Hooks();
render(changed, { visible: true, restoreFocusRef: ref({ handle: 4 }) });
render(changed, { visible: true, restoreFocusRef: ref({ handle: 5 }) });
changed.unmount();
flush();
assert.deepEqual(focused, [5], 'unmount restores the latest restore ref');

focused.length = 0;
const previous = new Hooks();
render(previous, { visible: true, restoreFocusRef: ref({ handle: 6 }) });
render(previous, { visible: false });
const next = new Hooks();
const nextResult = render(next, { visible: true, initialFocusRef: ref({ handle: 7 }) });
nextResult.onShow();
flush();
assert.deepEqual(focused, [7], 'a new modal cancels a pending restore');
next.unmount();

focused.length = 0;
const closing = new Hooks();
render(closing, { visible: true, restoreFocusRef: ref({ handle: 8 }) });
const opening = new Hooks();
const openingResult = render(opening, { visible: true, initialFocusRef: ref({ handle: 9 }) });
openingResult.onShow();
render(closing, { visible: false });
flush();
assert.deepEqual(focused, [9], 'a visible modal blocks a closing modal restore');
