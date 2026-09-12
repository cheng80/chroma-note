import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./motion.ts', import.meta.url), 'utf8');
assert(!source.includes('ReduceMotion.System'), 'motion hooks must not defer to the cached system setting');
const processingStepSource = readFileSync(new URL('./ProcessingStep.tsx', import.meta.url), 'utf8');
assert.match(
  processingStepSource,
  /withRepeat\(\s*withTiming\([\s\S]*?\),\s*-1,\s*false,\s*undefined,\s*reduceMotion \? ReduceMotion\.Always : ReduceMotion\.Never\s*,?\s*\)/,
  'repeating animations must pass the live reduce motion mode to the repeat wrapper',
);
const pending = {};
pending.promise = new Promise((resolve) => { pending.resolve = resolve; });
const listeners = new Set();
let removeCalls = 0;
const animationConfigs = [];
const reactState = [];
const effects = [];
let hookIndex = 0;
const react = {
  useState(initial) {
    const index = hookIndex++;
    if (!(index in reactState)) reactState[index] = typeof initial === 'function' ? initial() : initial;
    return [reactState[index], (value) => { reactState[index] = typeof value === 'function' ? value(reactState[index]) : value; }];
  },
  useEffect(effect) { effects.push(effect); },
};
const accessibilityInfo = {
  isReduceMotionEnabled: () => pending.promise,
  addEventListener: (_event, listener) => {
    listeners.add(listener);
    return { remove: () => { removeCalls += 1; listeners.delete(listener); } };
  },
};
const mocks = {
  react,
  'react-native': { AccessibilityInfo: accessibilityInfo },
  'react-native-reanimated': {
    Easing: { out: () => () => {}, cubic: () => {} },
    ReduceMotion: { Always: 'always', Never: 'never' },
    useAnimatedStyle: () => ({}),
    useSharedValue: () => ({ value: 0 }),
    withSpring: (value, config) => { animationConfigs.push(config); return value; },
    withTiming: (value, config) => { animationConfigs.push(config); return value; },
  },
  '../theme': { theme: { motion: { pressScale: 0.98, pressDuration: 100, enterDuration: 100 } } },
};
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', output)((id) => {
  if (!(id in mocks)) throw new Error(`missing motion check mock: ${id}`);
  return mocks[id];
}, module, module.exports);

const render = () => {
  hookIndex = 0;
  return module.exports.useLiveReduceMotion();
};
const renderPressScale = () => {
  hookIndex = 0;
  return module.exports.usePressScale();
};
const runEffects = () => effects.splice(0).map((effect) => effect());

assert.equal(render(), false, 'the hook starts with a safe default before the async setting query resolves');
const cleanups = runEffects();
assert.equal(listeners.size, 1, 'the hook subscribes to runtime reduce motion changes');
listeners.forEach((listener) => listener(true));
assert.equal(render(), true, 'a runtime event updates the hook before the initial query resolves');
const reducedConfig = animationConfigs.length;
renderPressScale().setPressed(true);
assert.equal(animationConfigs.at(-1).reduceMotion, 'always', 'reduced motion must force spring animations to stay reduced');
pending.resolve(false);
await pending.promise;
assert.equal(render(), true, 'a late initial query must not overwrite a newer runtime event');
listeners.forEach((listener) => listener(false));
assert.equal(render(), false, 'a runtime event can re-enable motion');
renderPressScale().setPressed(true);
assert.equal(animationConfigs.at(-1).reduceMotion, 'never', 'enabled motion must bypass Reanimated system state caching');
assert.ok(animationConfigs.length > reducedConfig, 'the live motion setting must reach a new animation call');
cleanups.forEach((cleanup) => cleanup?.());
assert.equal(removeCalls, 1, 'the runtime subscription is removed on unmount');
assert.equal(listeners.size, 0, 'the unmounted hook no longer receives runtime events');

console.log('motion.check passed: initial query, late response ordering, live event, and unsubscribe are covered');
