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
const effectDeps = [];
const sharedWrites = [];
let hookIndex = 0;
const react = {
  useState(initial) {
    const index = hookIndex++;
    if (!(index in reactState)) reactState[index] = typeof initial === 'function' ? initial() : initial;
    return [reactState[index], (value) => { reactState[index] = typeof value === 'function' ? value(reactState[index]) : value; }];
  },
  useRef(initial) { return react.useState(() => ({ current: initial }))[0]; },
  useEffect(effect, deps) {
    const index = hookIndex++;
    if (!effectDeps[index] || deps.some((value, i) => !Object.is(value, effectDeps[index][i]))) effects.push(effect);
    effectDeps[index] = deps;
  },
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
    interpolateColor: (value, _range, colors) => colors[value >= 1 ? 1 : 0],
    useSharedValue: (initial) => react.useState(() => {
      let current = initial;
      return { get value() { return current; }, set value(value) { sharedWrites.push(value); current = value; }, set(value) { sharedWrites.push(value); current = value; } };
    })[0],
    withSpring: (value, config) => { animationConfigs.push({ ...config, target: value }); return value; },
    withTiming: (value, config) => { animationConfigs.push({ ...config, target: value }); return value; },
  },
  '../theme': { theme: { motion: { pressScale: 0.96, pressDuration: 110, releaseDuration: 360, errorDuration: 600, enterDuration: 180 } } },
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
assert.equal(animationConfigs.at(-1).target, 1, 'reduced motion keeps the control at full size');
assert.equal(animationConfigs.at(-1).reduceMotion, 'always', 'reduced motion must force spring animations to stay reduced');
pending.resolve(false);
await pending.promise;
assert.equal(render(), true, 'a late initial query must not overwrite a newer runtime event');
listeners.forEach((listener) => listener(false));
assert.equal(render(), false, 'a runtime event can re-enable motion');
renderPressScale().setPressed(true);
assert.equal(animationConfigs.at(-1).reduceMotion, 'never', 'enabled motion must bypass Reanimated system state caching');
assert.equal(animationConfigs.at(-1).target, 0.96, 'press feedback has a noticeable scale');
renderPressScale().setPressed(false);
assert.equal(animationConfigs.at(-1).target, 1, 'release returns to full size');
assert.equal(animationConfigs.at(-1).dampingRatio, 0.55, 'release allows a tactile spring overshoot');
assert.equal(animationConfigs.at(-1).duration, 360, 'release has time to settle');
hookIndex = 0;
module.exports.usePressScale(true).setPressed(true);
assert.equal(animationConfigs.at(-1).target, 1, 'disabled controls cannot compress');
assert.ok(animationConfigs.length > reducedConfig, 'the live motion setting must reach a new animation call');
cleanups.forEach((cleanup) => cleanup?.());
assert.equal(removeCalls, 1, 'the runtime subscription is removed on unmount');
assert.equal(listeners.size, 0, 'the unmounted hook no longer receives runtime events');

// A new hook instance: rerenders model typing without changing the error prop.
reactState.length = 0;
effectDeps.length = 0;
effects.length = 0;
const renderField = (focused, error) => {
  hookIndex = 0;
  module.exports.useFieldFeedback(focused, error);
  return runEffects();
};
const fieldCleanups = renderField(false, undefined);
renderField(true, 'Invalid');
const firstErrorWrites = sharedWrites.filter(value => value === 1).length;
const firstErrorAnimations = animationConfigs.length;
renderField(true, 'Invalid');
assert.equal(animationConfigs.length, firstErrorAnimations, 'typing with the same error must not restart feedback');
renderField(false, 'Invalid');
assert.equal(sharedWrites.filter(value => value === 1).length, firstErrorWrites, 'blur does not replay the error cue');
renderField(false, 'Expired');
assert.equal(sharedWrites.filter(value => value === 1).length, firstErrorWrites + 1, 'a different error gets one new cue');
listeners.forEach(listener => listener(true));
renderField(false, 'Expired');
assert.equal(animationConfigs.at(-1).reduceMotion, 'always', 'enabling reduced motion stops the active error cue');
listeners.forEach(listener => listener(false));
renderField(false, 'Expired');
assert.equal(sharedWrites.filter(value => value === 1).length, firstErrorWrites + 1, 'motion preference changes do not replay an existing error');
renderField(false, undefined);
renderField(false, 'Expired');
assert.equal(sharedWrites.filter(value => value === 1).length, firstErrorWrites + 2, 'an error after clearing gets a fresh cue');
fieldCleanups.forEach(cleanup => cleanup?.());
console.log('motion.check passed: live reduced motion, tactile release, disabled press, and one cue per new error');
