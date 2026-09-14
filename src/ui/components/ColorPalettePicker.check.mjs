import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';

let stateIndex = 0, refIndex = 0;
const states = [], refs = [], selected = [];
const hooks = { ...React, useId: () => 'palette-check',
  useState(initial) {
    const i = stateIndex++;
    if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
    return [states[i], value => { states[i] = value; }];
  },
  useRef(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; },
};
const mocks = {
  react: hooks,
  'react-native': { Pressable: 'Pressable', View: 'View', StyleSheet: { create: value => value } },
  'react-native-svg': { default: 'Svg', Defs: 'Defs', LinearGradient: 'LinearGradient', Rect: 'Rect', Stop: 'Stop' },
  './SemanticText': { SemanticText: 'SemanticText' },
  '../theme': { theme: { colors: {} } },
};
const output = ts.transpileModule(readFileSync(new URL('./ColorPalettePicker.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function('require', 'exports', output)(id => { assert.ok(id in mocks, id); return mocks[id]; }, exports);
const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
function render() {
  stateIndex = refIndex = 0;
  return exports.ColorPalettePicker({ hex: '#5D9665', locale: 'ko', onSelect: hex => selected.push(hex) });
}
render().props.onLayout({ nativeEvent: { layout: { width: 300 } } });
const [shade, hue] = nodes(render()).filter(node => node.type === 'Pressable');
const event = (locationX, locationY = 0) => ({ nativeEvent: { locationX, locationY } });
// Native taps can arrive before React commits the hue render. Shade must use
// the latest tap, not the hue captured by the last rendered callback.
for (const [x, expected] of [[25, '#806040'], [175, '#406080'], [275, '#804060']]) {
  hue.props.onPress(event(x));
  shade.props.onPress(event(150, 74));
  assert.equal(selected.at(-1), expected, 'back-to-back hue and shade taps keep the most recent hue');
}
shade.props.onPress(event(-20, -20));
assert.equal(selected.at(-1), '#FFFFFF');
shade.props.onPress(event(400, 180));
assert.equal(selected.at(-1), '#000000');
console.log('ColorPalettePicker.check passed: rapid hue/shade input and edge clamping');
