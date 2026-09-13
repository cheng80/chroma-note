import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';

let index = 0;
const slots = [];
const hooks = { ...React, useRef: value => ({ current: value }), useState(initial) {
  const slot = index++;
  if (!(slot in slots)) slots[slot] = initial;
  return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
} };
const mocks = {
  react: hooks,
  'react-native': { Modal: 'Modal', Platform: { OS: 'ios' }, ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value } },
  'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' },
  '../primitives': { Button: 'Button', IconButton: 'IconButton', Notice: 'Notice' },
  '../record-copy': { imageSource: uri => ({ uri }) },
  '../demo-assets': { demoImages: {} },
  '../basic-copy': { getBasicCopy: () => ({}) },
  '../theme': { theme: { colors: {}, spacing: {} } },
  '../components/modalA11y': { useModalA11y: () => ({}) },
};
for (const name of ['RecordExportModal', 'RecordArtwork', 'AppIcon', 'FavoriteIcon', 'ZoomableImage', 'SemanticText']) mocks[`../components/${name}`] = { [name]: name };
for (const name of ['ReadSheet', 'RecordActionsSheet']) mocks[`../sheets/${name}`] = { [name]: name };
const output = ts.transpileModule(readFileSync(new URL('./DetailScreen.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', output)(id => { assert.ok(id in mocks, id); return mocks[id]; }, module, module.exports);
const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
let stamp = { local_uri: 'file:///cache/same-record.png', width: 100, height: 100 };
function render() {
  index = 0;
  const all = nodes(module.exports.DetailScreen({ locale: 'ko', record: { stamp, fields: {} } }));
  return { artwork: all.find(node => node.type === 'RecordArtwork'), error: all.some(node => node.type === 'Notice') };
}
const failedAttempt = render().artwork;
failedAttempt.props.onImageError();
assert.equal(render().error, true);
stamp = { ...stamp };
assert.equal(render().error, false, 'freshly recovered image clears the error even at the same file URI');
assert.equal(render().artwork.props.imageMissing, false);
failedAttempt.props.onImageError();
assert.equal(render().error, false, 'late errors from the previous image cannot hide the recovered image');
render().artwork.props.onImageError();
assert.equal(render().error, true, 'a real failure of the new image still shows retry');
console.log('DetailScreen.check passed: recovered cache at the same URI, stale callbacks and current failures');
