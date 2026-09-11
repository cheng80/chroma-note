// Run with the iPhone on the line-art review screen. Selects no photo or account data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const windows = JSON.parse(execFileSync('orca', ['computer', 'list-windows', '--app', 'Simulator', '--json'], { encoding: 'utf8' }));
const phone = windows.result.windows.find(window => window.title.startsWith('iPhone'));
assert.ok(phone, 'Open the iPhone simulator first.');
const common = ['--app', 'Simulator', '--window-id', String(phone.id), '--json', '--no-screenshot'];
function call(command, ...args) {
  const result = JSON.parse(execFileSync('orca', ['computer', command, ...common, ...args], { encoding: 'utf8' }));
  assert.ok(result.ok, result.error?.code);
  return result.result.snapshot.treeText;
}
async function button(label) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const tree = call('get-app-state');
    const line = tree.split('\n').find(line => line.includes(`button ${label},`) || line.trimEnd().endsWith(`button ${label}`));
    if (line) return call('click', '--element-index', line.trim().split(' ')[0]);
    await setTimeout(200);
  }
  assert.fail(`Button not found: ${label}`);
}
await button('사진 바꾸기');
await setTimeout(350);
await button('사진 바꾸기');
let picker = '';
for (let attempt = 0; attempt < 15; attempt++) {
  picker = call('get-app-state');
  if (/사진 선택|Photo Library|Photos|Choose Photo|사진 보관함/.test(picker)) break;
  await setTimeout(200);
}
assert.ok(/사진 선택|Photo Library|Photos|Choose Photo|사진 보관함/.test(picker), 'FAIL: system photo picker did not open after replacement confirmation.');
console.log('PASS: replacement confirmation opens the system photo picker.');
