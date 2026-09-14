import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';

function compile(path, mocks) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(id => {
    assert.ok(id in mocks, `Unexpected dependency: ${id}`);
    return mocks[id];
  }, exports);
  return exports;
}
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390, fontScale: 1 }) };
const primitives = { Button: 'Button', IconButton: 'IconButton', StampImage: 'StampImage', Notice: 'Notice' };
const theme = { colors: {}, spacing: {}, typography: {}, radii: {}, shadows: {} };
const recordCopy = compile('../record-copy.ts', {});
const recordWriting = compile('../record-writing.ts', {});
const components = compile('./NewRecordDraftActions.tsx', {
  react: React, 'react-native': native, '../primitives': primitives, '../record-copy': recordCopy,
  '../record-writing': recordWriting, '../theme': { theme }, './AppIcon': { AppIcon: 'AppIcon' }, './SemanticText': { SemanticText: 'SemanticText' },
});
function nodes(element) {
  if (!React.isValidElement(element)) return [];
  if (typeof element.type === 'function') return nodes(element.type(element.props));
  return [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}
const makeDraft = (draft_id, kind) => ({ draft_id, kind, fields: { diary_date: '2026-09-14', user_note: draft_id, ai_field_note: '', place_name: '' }, selected_candidate: { local_uri: `https://example.com/${draft_id}`, image_headers: { Authorization: 'test' } } });
const fresh = makeDraft('new-photo', 'new');
const edits = [makeDraft('edit-first', 'edit'), makeDraft('edit-second', 'edit')];
for (const locale of ['ko', 'en']) {
  for (const drafts of [[], [fresh], edits, [edits[1], fresh, edits[0]]]) {
    const resumed = [], deleted = [];
    const props = { locale, drafts, onResumeDraft: id => resumed.push(id), onDeleteDraft: id => deleted.push(id), fallbackSource: 1 };
    const snapshot = JSON.stringify(drafts);
    const footer = nodes(components.NewRecordDraftActions(props));
    const newButtons = footer.filter(node => node.type === 'Button');
    assert.equal(newButtons.length, drafts.includes(fresh) ? 1 : 0);
    for (const element of footer) {
      if (element.type === 'Button' || element.type === 'Pressable' || element.type === 'IconButton') element.props.onPress();
    }
    const expected = drafts.filter(draft => draft.kind === 'new').map(draft => draft.draft_id);
    assert.deepEqual(resumed, expected);
    assert.deepEqual(deleted, expected);
    assert.equal(JSON.stringify(drafts), snapshot);
  }
}
assert.equal(nodes(components.NewRecordDraftActions({ locale: 'ko', drafts: [fresh, makeDraft('extra-new', 'new')] })).filter(node => node.type === 'Button').length, 1);
const { BookScreen } = compile('../screens/BookScreen.tsx', {
  react: { ...React, useRef: value => ({ current: value }), useState: value => [value, () => {}] },
  'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  '../primitives': primitives, '../components/FilterChip': { FilterChip: 'FilterChip' },
  '../../domain/color-search': { COLOR_PRESETS: [] }, '../components/RecordCard': { RecordCard: 'RecordCard' },
  '../components/NewRecordDraftActions': components, '../components/AppIcon': { AppIcon: 'AppIcon' },
  '../components/SemanticText': { SemanticText: 'SemanticText' }, '../sheets/FilterSheet': { FilterSheet: 'FilterSheet' },
  '../basic-copy': { getBasicCopy: () => ({}) }, '../theme': { theme }, '../record-copy': recordCopy,
  '../record-writing': recordWriting, '../../../design/images/lineart-style1-source-rgb.png': 1,
});
for (const list_state of ['empty', 'ready', 'filter-empty', 'loading', 'error', 'partial-cache']) {
  const tree = nodes(BookScreen({ locale: 'ko', list_state, drafts: [fresh, ...edits], records: [], filter: {} }));
  const scroll = tree.find(node => node.type === 'ScrollView');
  assert.equal(nodes(scroll).filter(node => node.type === 'Pressable').length, 0, `${list_state}: no saved-record edit list`);
  assert.equal(tree.filter(node => node.type === 'Button' && node.props.label === '새 기록 초안 이어 쓰기').length, 1);
}
const resumed = [];
const recovery = nodes(BookScreen({ locale: 'ko', list_state: 'ready', drafts: edits, records: [], filter: {}, save_attempt: { draft_id: edits[0].draft_id, state: 'uncertain' }, onResumeDraft: id => resumed.push(id) }));
const recoveryButton = recovery.find(node => node.type === 'Button' && node.props.label === '저장 결과 확인');
assert.ok(recoveryButton, 'uncertain submitted saves remain recoverable from Book');
recoveryButton.props.onPress();
assert.deepEqual(resumed, [edits[0].draft_id]);
console.log('NewRecordDraftActions.check passed: only new photo draft appears, unfinished edit save remains recoverable');
