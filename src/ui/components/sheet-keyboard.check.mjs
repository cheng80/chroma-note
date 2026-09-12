import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./Sheet.tsx', import.meta.url), 'utf8');
const callback = source.match(/const revealInput = useCallback\(\(\) => \{([^]*?)\n  \}, \[viewportHeight\]\);/);
assert.ok(callback, 'Sheet must reveal the focused input after keyboard/layout changes');
const code = ts.transpileModule(callback[1], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function reveal({ keyboard = true, inputHeight = 240, viewportHeight = 300, keyboardY = 600 } = {}) {
  const calls = [];
  const scroll = { current: {
    scrollResponderScrollNativeHandleToKeyboard: (...args) => calls.push(args),
  } };
  new Function('Platform', 'Keyboard', 'scroll', 'focusedInput', 'theme', 'viewportHeight', 'UIManager', code)(
    { OS: 'ios' }, { metrics: () => keyboard ? { screenY: keyboardY } : undefined }, scroll, { current: 7 }, { spacing: { sm: 8 } }, viewportHeight,
    { measure: (_target, fn) => fn(0, 0, 350, inputHeight) });
  return calls;
}
assert.deepEqual(reveal(), [[7, 308, true]], 'the actual viewport must include all footer and safe-area space');
assert.deepEqual(reveal({ inputHeight: 500, viewportHeight: 180 }), [[7, 92, true]], 'an oversized input must start in the visible body instead of scrolling its first line away');
const viewportY = 136.667, viewportHeight = 242.333, keyboardY = 539, inputHeight = 54, inputTop = 800;
const offset = reveal({ inputHeight, viewportHeight, keyboardY })[0][1];
const scrolledBy = inputTop - keyboardY + inputHeight + offset;
assert.ok(viewportY + inputTop - scrolledBy + inputHeight <= viewportY + viewportHeight - 8,
  'the focused field must fit above the fixed footer, including the 34px safe area');
assert.deepEqual(reveal({ keyboard: false }), [], 'a hidden keyboard must not move the sheet');
assert.deepEqual(reveal({ viewportHeight: 0 }), [], 'wait for the viewport before scrolling');
console.log('sheet-keyboard.check passed: viewport, safe-area footer, oversized input, hidden keyboard');
