import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

const source = readFileSync(new URL('./FavoriteIcon.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
} }).outputText;
function harness(initialReduced = false) {
  const slots = [], values = [], cancelled = new Set();
  let index = 0, effects = [], reduced = initialReduced;
  const slot = create => slots[index++] ??= create();
  const exports = {};
  const modules = {
    react: { ...React,
      useRef: initial => slot(() => ({ current: initial })),
      useEffect(effect, deps) {
        const saved = slot(() => ({}));
        if (!saved.deps || deps.some((value, i) => value !== saved.deps[i])) {
          saved.deps = deps;
          effects.push(() => { saved.cleanup?.(); saved.cleanup = effect(); });
        }
      },
    },
    'react-native': { View: 'View', StyleSheet: { create: value => value } },
    'react-native-reanimated': { default: { View: 'AnimatedView' },
      cancelAnimation: value => cancelled.add(value), ReduceMotion: { Never: 'never' },
      Easing: { out: value => value, cubic: 'cubic', quad: 'quad' },
      useAnimatedStyle: () => ({}),
      useSharedValue: initial => slot(() => { const value = { value: initial }; values.push(value); return value; }),
      withTiming: (to, config) => ({ kind: 'timing', to, config }),
      withSpring: (to, config) => ({ kind: 'spring', to, config }),
      withSequence: (mode, ...steps) => ({ kind: 'sequence', mode, steps }),
    },
    './motion': { useLiveReduceMotion: () => reduced }, './AppIcon': { AppIcon: 'AppIcon' },
    '../theme': { theme: { colors: {}, motion: { enterDuration: 180, pressDuration: 110, releaseDuration: 360 } } },
  };
  vm.runInNewContext(code, { exports, require(id) { assert.ok(id in modules, id); return modules[id]; } });
  return {
    render(selected) { index = 0; exports.FavoriteIcon({ selected }); effects.splice(0).forEach(effect => effect()); },
    values, cancelled, setReduced(value) { reduced = value; },
    unmount() { cancelled.clear(); slots.forEach(saved => saved.cleanup?.()); },
  };
}
const restored = harness();
restored.render(true);
assert.deepEqual(restored.values.map(value => value.value), [1, 1, 1], 'restored favorite is filled without a flourish');
restored.render(true);
assert.equal(restored.values[0].value, 1, 'unchanged selected must not trigger scale motion');
restored.unmount();
const icon = harness();
icon.render(false);
assert.deepEqual(icon.values.map(value => value.value), [1, 0, 1]);
icon.render(true);
const [scale, fill, echo] = icon.values;
assert.equal(scale.value.kind, 'sequence');
assert.deepEqual(scale.value.steps.map(step => step.to), [1.6, 1]);
assert.equal(scale.value.steps[1].kind, 'spring', 'selection returns to normal size with a spring');
assert.equal(fill.value.to, 1, 'the selected fill stays visible after the flourish');
assert.equal(echo.value.to, 1, 'the expanding outline ends fully faded');
const selectionAnimation = scale.value;
icon.render(true);
assert.equal(scale.value, selectionAnimation, 'unrelated renders must not restart the flourish');
icon.render(false);
assert.equal(scale.value, 1);
assert.equal(echo.value, 1, 'rapid deselection stops the outline flourish');
assert.equal(fill.value.to, 0, 'deselection fades the fill instead of flashing the whole icon');
icon.setReduced(true); icon.render(true);
assert.deepEqual(icon.values.map(value => value.value), [1, 1, 1], 'live reduced motion settles all layers immediately');
icon.setReduced(false); icon.render(true);
assert.deepEqual(icon.values.map(value => value.value), [1, 1, 1], 're-enabling motion must not replay a restored selection');
icon.unmount();
assert.equal(icon.cancelled.size, 3, 'unmount cancels every animated value');
const reduced = harness(true);
reduced.render(false); reduced.render(true); reduced.render(false);
assert.deepEqual(reduced.values.map(value => value.value), [1, 0, 1], 'reduced motion uses static states throughout');
reduced.unmount();
console.log('FavoriteIcon.check passed: actual selection only, restored state, scale spring, fill fade, rapid deselection, reduced motion and cleanup');
