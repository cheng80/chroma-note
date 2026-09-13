import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

let instance, index = 0;
const hooks = {
  ...React,
  useState(initial) {
    const owner = instance, slot = index++;
    if (!(slot in owner.slots)) owner.slots[slot] = initial;
    return [owner.slots[slot], value => { owner.slots[slot] = value; }];
  },
  useEffect(effect, deps) {
    const slot = index++;
    if (!instance.deps[slot] || deps.some((value, i) => !Object.is(value, instance.deps[slot][i]))) instance.effects.push(effect);
    instance.deps[slot] = deps;
  },
};
const animated = {
  View: 'AnimatedView', ReduceMotion: { Always: 'always', Never: 'never' },
  useSharedValue: initial => hooks.useState({ value: initial })[0],
  useAnimatedStyle: callback => callback(),
  withTiming: value => value, withSpring: value => value, withDelay: (_delay, value) => value,
  cancelAnimation() {},
};
const modules = {
  react: hooks,
  'react-native': { Image: 'Image', View: 'View', StyleSheet: { create: value => value, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } } },
  'react-native-reanimated': animated,
  '../theme': { theme: { colors: {}, radii: {} } },
  './AppIcon': { AppIcon: 'AppIcon' },
  './LoadingSkeleton': { LoadingSkeleton: 'LoadingSkeleton' },
  './motion': { useLiveReduceMotion: () => false },
  './SemanticText': { SemanticText: 'SemanticText' },
};
function loadComponent(filename) {
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require: name => {
  assert.ok(name in modules, `Unexpected dependency: ${name}`);
  return modules[name];
} });
return exports;
}
const exports = loadComponent('./StampImage.tsx');
function nodes(element) {
  return !React.isValidElement(element) ? [] : [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}
function mount(props) {
  let current;
  return (changes = {}) => {
    props = { ...props, ...changes };
    const wrapper = exports.StampImage(props);
    if (!current || current.key !== wrapper.key) current = { key: wrapper.key, slots: [], deps: [], effects: [] };
    instance = current;
    const draw = () => { index = 0; return wrapper.type(wrapper.props); };
    let tree = draw();
    const initialTree = tree;
    while (current.effects.length) {
      current.effects.splice(0).forEach(effect => effect());
      tree = draw();
    }
    const all = nodes(tree);
    return { key: wrapper.key, tree, initialTree, all, image: all.find(node => node.type === 'Image'), skeleton: all.some(node => node.type === 'LoadingSkeleton') };
  };
}
const failures = [];
function check(name, run) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
}
const auth = [{ uri: 'https://example.invalid/private.png', headers: { Authorization: 'Bearer test-only' } }];
check('source and authentication array identity are preserved', () => {
  for (const source of [42, { uri: 'file:///stamp.png' }, auth]) assert.equal(mount({ source })().image.props.source, source);
});
check('load lifecycle preserves native callback arguments and reveals only after load', () => {
  const calls = [], event = { nativeEvent: { source: { width: 100, height: 100 } } };
  const onLoadEnd = () => {};
  const render = mount({ source: auth, onLoadStart: (...args) => calls.push(args), onLoad: value => calls.push(value), onLoadEnd });
  let view = render();
  assert.equal(view.skeleton, true);
  view.image.props.onLoadStart();
  assert.equal(render().skeleton, true);
  view.image.props.onLoad(event);
  view = render();
  assert.equal(view.skeleton, false);
  assert.equal(view.all[1].props.style.at(-1).opacity, 1);
  assert.equal(calls[0].length, 0, 'RN onLoadStart has no argument');
  assert.equal(calls[1], event);
  assert.equal(view.image.props.onLoadEnd, onLoadEnd);
});
check('cached iOS onLoad then onLoadStart stays loaded and forwards both callbacks', () => {
  for (const renderBetweenEvents of [false, true]) {
    const calls = [], event = { nativeEvent: { source: { width: 100, height: 100 } } };
    const render = mount({ source: auth, onLoad: value => calls.push(value), onLoadStart: (...args) => calls.push(args) });
    let view = render();
    view.image.props.onLoad(event);
    if (renderBetweenEvents) view = render();
    view.image.props.onLoadStart();
    view = render();
    assert.equal(view.skeleton, false, 'a late cached load-start cannot re-open the skeleton');
    assert.equal(view.all[1].props.style.at(-1).opacity, 1, 'cached image remains revealed');
    assert.equal(calls.length, 2);
    assert.equal(calls[0], event);
    assert.equal(calls[1].length, 0, 'load-start is still forwarded without arguments');
  }
});
check('processing photo stays fully visible before load and uses the transparent shimmer mode', () => {
  const render = mount({ source: { uri: 'file:///existing-photo.jpg' }, processing: true });
  let view = render();
  assert.equal(nodes(view.initialTree)[1].props.style.at(-1).opacity, 1, 'photo is visible even before effects run');
  for (const loaded of [false, true]) {
    if (loaded) view.image.props.onLoad({ nativeEvent: {} });
    else view.image.props.onLoadStart?.();
    view = render();
    assert.equal(view.all[1].props.style.at(-1).opacity, 1, 'pending native callbacks must not hide the existing photo');
    assert.equal(view.all.find(node => node.type === 'LoadingSkeleton').props.overlay, true);
  }
});
check('LoadingSkeleton overlay has a transparent base instead of a placeholder', () => {
  modules['react-native'].AppState = { currentState: 'active' };
  modules['react-native-svg'] = { Svg: 'Svg', Defs: 'Defs', LinearGradient: 'LinearGradient', Rect: 'Rect', Stop: 'Stop' };
  const { LoadingSkeleton } = loadComponent('./LoadingSkeleton.tsx');
  for (const overlay of [false, true]) {
    instance = { slots: [], deps: [], effects: [] };
    index = 0;
    const tree = LoadingSkeleton({ overlay });
    const style = Object.assign({}, ...tree.props.style.filter(Boolean));
    assert.equal(style.backgroundColor, overlay ? 'transparent' : '#D7DED966');
    assert.equal(tree.props.pointerEvents, 'none');
  }
});
for (const processing of [false, true]) check(`image error ends skeleton, processing=${processing}`, () => {
  const error = { nativeEvent: { error: 'load failed' } };
  let received;
  const render = mount({ source: auth, processing, onError: value => { received = value; } });
  render().image.props.onError(error);
  assert.equal(received, error);
  assert.equal(render().skeleton, false);
});
check('export never overlays a skeleton/badge or changes wrapper opacity/scale', () => {
  const render = mount({ source: auth, reveal: 'none', completionLabel: 'Completed', processing: true });
  for (const state of ['loading', 'loaded', 'error']) {
    let view = render();
    if (state === 'loaded') view.image.props.onLoad({ nativeEvent: {} });
    if (state === 'error') view.image.props.onError({ nativeEvent: { error: 'failed' } });
    view = render();
    assert.equal(view.skeleton, false);
    assert.equal(view.all.some(node => node.type === 'SemanticText' || node.type === 'AppIcon'), false);
    assert.equal(view.all[1].props.style.at(-1).opacity, 1);
    assert.equal(view.tree.props.style.at(-1).transform[0].scale, 1);
  }
});
check('export disables the native Android fade too', () => {
  assert.equal(mount({ source: auth, reveal: 'none' })().image.props.fadeDuration, 0);
});
check('source or auth change creates a fresh loading instance', () => {
  const render = mount({ source: auth });
  const first = render();
  first.image.props.onLoad({ nativeEvent: {} });
  assert.equal(render().skeleton, false);
  assert.equal(render({ source: [{ ...auth[0], headers: { ...auth[0].headers } }] }).key, first.key);
  const refreshed = render({ source: [{ ...auth[0], headers: { Authorization: 'Bearer refreshed-test-only' } }] });
  assert.notEqual(refreshed.key, first.key);
  assert.equal(refreshed.skeleton, true);
  const replaced = render({ source: { uri: 'file:///replacement.png' } });
  assert.notEqual(replaced.key, refreshed.key);
  assert.equal(replaced.skeleton, false, 'local replacement is visible without a loading animation');
});
check('each local detail mount is immediately visible without either fade or skeleton', () => {
  for (const source of [42, { uri: 'file:///cached.png' }, [{ uri: 'file:///cached.png' }]]) {
    for (let visit = 0; visit < 3; visit++) {
      const render = mount({ source });
      const view = render();
      assert.equal(nodes(view.initialTree)[1].props.style.at(-1).opacity, 1);
      assert.equal(view.image.props.fadeDuration, 0);
      assert.equal(view.skeleton, false);
      view.image.props.onError({ nativeEvent: { error: 'missing file' } });
      assert.equal(render().all.some(node => node.type === 'AppIcon'), true, 'missing-file fallback remains available');
    }
  }
});
check('newly generated local result still reveals and shows its completion badge', () => {
  const render = mount({ source: { uri: 'file:///new-result.png' }, reveal: 'pop', completionLabel: '완료' });
  assert.equal(render().skeleton, true);
  render().image.props.onLoad({ nativeEvent: {} });
  assert.equal(render().skeleton, false);
  assert.equal(render().all.some(node => node.type === 'SemanticText'), true);
});
assert.equal(failures.length, 0, `StampImage.check failed: ${failures.join('; ')}`);
console.log('StampImage.check passed');
