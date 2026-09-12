import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { recordWriting } from '../record-writing.ts';

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
}
const production = compile('./RecordExportModal.tsx');
const sizing = {};
vm.runInNewContext(compile('../export-record.ts'), { exports: sizing });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function nodes(element) {
  return !React.isValidElement(element) ? [] : [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}

function mount(fields) {
  const record = { fields, stamp: { local_uri: 'file:///sketch.png', width: 600, height: 800 } };
  const original = JSON.stringify(record);
  const permission = deferred();
  const requested = deferred();
  const captures = [], assets = [], releases = [];
  const slots = [];
  let cursor = 0, effects = [], tree;
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        slots[index] = { value: factory(), dependencies };
      }
      return slots[index].value;
    },
    useCallback(callback, dependencies) { return hooks.useMemo(() => callback, dependencies); },
    useLayoutEffect(effect) { cursor++; effects.push(effect); },
  };
  const modules = {
    react: hooks,
    'react-native': {
      Linking: { async openSettings() {} }, Platform: { OS: 'ios' }, PixelRatio: { get: () => 3 },
      Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
      StyleSheet: { create: value => value },
    },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' },
    '../demo-assets': { demoAssets: { stamp: { source: {} } } },
    '../export-record': sizing,
    '../record-copy': { imageSource: uri => ({ uri }) },
    '../record-writing': { recordWriting },
    '../theme': { theme: { colors: {}, spacing: {}, typography: { heading: {}, body: {}, secondary: {} } } },
    './Button': { Button: 'Button' }, './IconButton': { IconButton: 'IconButton' },
    './Notice': { Notice: 'Notice' }, './RecordArtwork': { RecordArtwork: 'RecordArtwork' },
    './SemanticText': { SemanticText: 'SemanticText' },
    './modalA11y': { useModalA11y: () => ({ dialogRef: {}, onShow() {} }) },
    'expo-media-library': {
      async getPermissionsAsync() { return { granted: false, canAskAgain: true }; },
      requestPermissionsAsync() { requested.resolve(); return permission.promise; },
      Asset: { async create(uri) { assets.push(uri); return { id: 'saved-asset' }; } },
    },
    'react-native-view-shot': {
      async captureRef(_ref, options) { captures.push({ ...options }); return '/tmp/export.png'; },
      releaseCapture(uri) { releases.push(uri); },
    },
  };
  const exports = {};
  vm.runInNewContext(production, { exports, requestAnimationFrame: callback => queueMicrotask(callback), require: name => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } });
  function render() {
    cursor = 0;
    effects = [];
    tree = nodes(exports.RecordExportModal({ record, locale: 'en', onClose() {} }));
    effects.forEach(effect => effect());
    assert.equal(JSON.stringify(record), original, 'render/save must preserve record text and data');
    assert.equal(artwork().props.fields, fields, 'pass original fields to the artwork');
  }
  const artwork = () => tree.find(node => node.type === 'RecordArtwork');
  const button = label => {
    const node = tree.find(node => node.type === 'Button' && node.props.label === label);
    assert.ok(node, `Missing button: ${label}`);
    return node.props;
  };
  const layout = (width, height) => {
    tree.find(node => node.type === 'View' && node.props.onLayout).props.onLayout({ nativeEvent: { layout: { width, height } } });
    render();
  };
  function settle(ready = true) {
    for (const field of ['place', 'note']) artwork().props.onTextSettled(field, ready);
    render();
  }
  function loaded() { artwork().props.onImageLoad(); render(); }
  render();
  return { render, artwork, button, layout, loaded, settle, permission, requested, captures, assets, releases };
}

const fields = { diary_date: '2026-09-12', place_name: '직접 쓴 장소', user_note: '  사용자 메모\n두 번째 줄  ',
  ai_field_note: 'AI 원문\n보존', ai_field_note_edited: '편집한 AI 글\n공백  보존', semantic_tags: ['태그'], mood_tags: ['차분함'] };

// Invoke the actual save closure, then commit a new layout while permission is pending.
const resized = mount(structuredClone(fields));
resized.layout(320, 640);
resized.loaded();
assert.equal(resized.button('Save to gallery').disabled, true, 'text measurements must finish first');
await resized.button('Save to gallery').onPress();
assert.equal(resized.captures.length, 0);
resized.settle();
assert.equal(resized.button('Save to gallery').disabled, false);
const resizingSave = resized.button('Save to gallery').onPress();
await resized.requested.promise;
resized.layout(540, 720);
resized.permission.resolve({ granted: true });
await resizingSave;
resized.render();
assert.deepEqual(resized.captures, [{ format: 'png', result: 'tmpfile', width: 360, height: 480 }], 'capture latest dimensions, not the old 360 x 720');
assert.deepEqual(resized.assets, ['file:///tmp/export.png']);
assert.deepEqual(resized.releases, ['/tmp/export.png']);
resized.button('Done');

// Each measured field becoming unready must block capture; the same modal can retry.
for (const field of ['place', 'note']) {
  const pending = mount(structuredClone(fields));
  pending.layout(320, 640);
  pending.loaded();
  pending.settle();
  const saving = pending.button('Save to gallery').onPress();
  await pending.requested.promise;
  pending.layout(540, 720);
  pending.artwork().props.onTextSettled(field, false);
  pending.render();
  pending.permission.resolve({ granted: true });
  await saving;
  pending.render();
  assert.equal(pending.captures.length, 0, `${field}: unready text must prevent capture`);
  assert.equal(pending.assets.length, 0);
  assert.equal(pending.button('Save to gallery').disabled, true);
  pending.settle();
  assert.equal(pending.button('Save to gallery').disabled, false);
  await pending.button('Save to gallery').onPress();
  pending.render();
  assert.equal(pending.captures.length, 1, 'retry must release the saving guard');
  assert.equal(pending.captures[0].height, 480);
  pending.button('Done');
}

const empty = mount({ ...fields, place_name: null, user_note: '', ai_field_note_edited: '' });
empty.layout(320, 640);
empty.loaded();
assert.equal(empty.button('Save to gallery').disabled, false, 'empty edited writing overrides original AI text and needs no text callbacks');
const emptySave = empty.button('Save to gallery').onPress();
await empty.requested.promise;
empty.permission.resolve({ granted: true });
await emptySave;
empty.render();
assert.equal(empty.assets.length, 1);
empty.button('Done');

console.log('RecordExportModal.check passed: async resize, text readiness, retry, empty writing, original data preservation.');
