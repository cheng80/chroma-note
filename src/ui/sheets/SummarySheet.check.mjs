import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { recordCopy } from '../record-copy.ts';

const exports = {};
const modules = {
  react: React,
  'react-native': { StyleSheet: { create: value => value }, Text: 'Text', View: 'View' },
  '../components/Palette': { Palette: 'Palette' },
  '../components/SemanticText': { SemanticText: 'SemanticText' },
  '../primitives': { Button: 'Button', Field: 'Field', Notice: 'Notice', Sheet: 'Sheet' },
  '../record-copy': { recordCopy },
  '../theme': { theme: { colors: {}, typography: {}, spacing: {} } },
  './DatePlaceSheet': { DatePlaceSheet: 'DatePlaceSheet' },
};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./SummarySheet.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText, { exports, require: name => {
  assert.ok(name in modules, `Unexpected dependency: ${name}`);
  return modules[name];
} });
function nodes(element) {
  return !React.isValidElement(element) ? [] : [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}
for (const locale of ['ko', 'en']) {
  const working = { user_note: '직접 쓴 글\n\nAI가 제안한 글', ai_field_note_edited: '', scene: null, semantic_tags: [], mood_tags: [] };
  const sheet = { kind: 'analysis', initial: working, working, error: null, caption_status: 'idle' };
  const before = JSON.stringify(sheet);
  let change;
  const output = exports.SummarySheet({ locale, sheet, onChangeSheet: value => { change = value; }, onApply() {}, onCancel() {}, onClose() {}, onRequestCaption() {} });
  const editor = nodes(output).find(node => typeof node.type === 'function');
  const rendered = nodes(editor.type(editor.props));
  const fields = rendered.filter(node => node.type === 'Field' && node.props.multiline);
  assert.equal(fields.length, 1, 'writing and AI suggestions share exactly one multiline field');
  assert.equal(fields[0].props.label, recordCopy[locale].memoField);
  assert.equal(fields[0].props.value, working.user_note);
  assert.ok(rendered.some(node => node.type === 'Button' && node.props.label === recordCopy[locale].suggest));
  fields[0].props.onChangeText('수정한 하나의 글');
  assert.equal(change.working.user_note, '수정한 하나의 글');
  assert.equal(change.working.ai_field_note_edited, '');
  assert.equal(JSON.stringify(sheet), before, 'editing must not mutate the supplied draft');
}
console.log('SummarySheet.check passed: one writing field, shared AI action and immutable edits in both locales.');
