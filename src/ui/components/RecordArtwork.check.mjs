import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { recordWriting } from '../record-writing.ts';

const exports = {};
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: value => value } };
const source = readFileSync(new URL('./RecordArtwork.tsx', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
} }).outputText, { exports, require: name => {
  const modules = {
    react: React, 'react-native': native,
    'react-native-reanimated': { createAnimatedComponent: component => component },
    '../record-copy': { displayDate: value => value },
    '../record-writing': { recordWriting },
    '../theme': { theme: { colors: {}, radii: {}, shadows: {} } },
    './motion': { usePressScale: () => ({ animatedStyle: {}, setPressed() {} }) },
    './StampImage': { StampImage: 'StampImage' },
    './LineArtDisclaimer': { LineArtDisclaimer: 'LineArtDisclaimer' },
    './SemanticText': { SemanticText: 'SemanticText' },
  };
  assert.ok(name in modules, `Unexpected dependency: ${name}`);
  return modules[name];
} });
function nodes(element) {
  return !React.isValidElement(element) ? [] : [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}
const fields = { diary_date: '2026-09-12', place_name: 'Place', user_note: 'Memo',
  ai_field_note: 'AI writing', semantic_tags: ['Object'], mood_tags: ['Calm'] };
const snapshot = JSON.stringify(fields);
for (const locale of ['ko', 'en']) {
  const render = options => nodes(exports.RecordArtwork({ fields, locale, source: { uri: 'file:///lineart.png' }, ...options }));
  const screen = render({ onImagePress() {} });
  assert.equal(screen.filter(node => node.type === 'LineArtDisclaimer').length, 1);
  const output = render({ exportMode: true, onImagePress() {} });
  assert.equal(output.filter(node => node.type === 'LineArtDisclaimer').length, 0, 'export must omit the conversion notice');
  assert.equal(output.filter(node => node.type === 'StampImage').length, 1);
  assert.equal(output.filter(node => node.type === 'Pressable').length, 0);
  assert.equal(render({ imageMissing: true }).filter(node => node.type === 'LineArtDisclaimer').length, 0);
  for (const value of ['Memo\n\nAI writing', 'Place', '#Object', '#Calm']) {
    assert.ok(output.some(node => ['Text', 'SemanticText'].includes(node.type) && React.Children.toArray(node.props.children).join('') === value), `export lost ${value}`);
  }
  const readiness = [];
  render({ exportMode: true, onTextSettled: (field, ready) => readiness.push([field, ready]) })
    .filter(node => node.type === 'SemanticText').forEach(node => node.props.onSettled(true));
  assert.deepEqual(readiness, [['place', true], ['note', true]], 'export must observe every measured text field');
}
assert.equal(JSON.stringify(fields), snapshot, 'notice must not change stored fields');
console.log('RecordArtwork.check passed: screen notice, missing image, clean export and preserved content in both locales');
