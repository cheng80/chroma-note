// Open a short sheet, or a long sheet with the keyboard, on the iPhone first.
// Usage: node scripts/check-sheet-scroll.mjs static|scrollable
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const expected = process.argv[2];
assert.ok(['static', 'scrollable'].includes(expected), 'Choose static or scrollable.');
const orca = process.env.ORCA_CLI_COMMAND ?? 'orca';
const call = (args) => {
  const response = JSON.parse(execFileSync(orca, ['computer', ...args, '--json'], { encoding: 'utf8' }));
  assert.ok(response.ok, response.error?.code);
  return response.result;
};
const phone = call(['list-windows', '--app', 'Simulator']).windows.find(window => window.title.startsWith('iPhone'));
assert.ok(phone, 'An already running iPhone simulator is required.');
const tree = call(['get-app-state', '--app', 'Simulator', '--window-id', String(phone.id), '--no-screenshot']).snapshot.treeText;
assert.match(tree, /(?:button|generic element) (?:문구 편집|날짜와 장소|사진에서 찾은 색|필터) 닫기/, 'Open the intended sheet before running this check.');
const scrolls = tree.includes('scroll down');
assert.equal(scrolls, expected === 'scrollable', 'Sheet scrolling does not match its available space.');
const footer = tree.split('\n').find(line => /(?:button|generic element) (?:초안에 적용|필터 적용|닫기),/.test(line));
assert.ok(footer && !footer.includes('scroll down'), 'The footer must stay outside the scrollable body.');
console.log(`PASS: ${expected} sheet with a fixed footer.`);
