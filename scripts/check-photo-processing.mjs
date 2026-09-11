// On the iPhone, import a test photo first. This does not save/upload the record.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const orca = process.env.ORCA_CLI_COMMAND ?? 'orca';
const call = (args) => {
  const response = JSON.parse(execFileSync(orca, ['computer', ...args, '--json'], { encoding: 'utf8' }));
  assert.ok(response.ok, response.error?.code);
  return response.result;
};
const phone = call(['list-windows', '--app', 'Simulator']).windows.find(window => window.title.startsWith('iPhone'));
assert.ok(phone, 'An already running iPhone simulator is required.');
const scope = ['--app', 'Simulator', '--window-id', String(phone.id), '--no-screenshot'];
const state = () => call(['get-app-state', ...scope]).snapshot.treeText;
function click(tree, label) {
  const line = tree.split('\n').find(line => line.includes(`button ${label},`) || line.includes(`generic element ${label},`));
  assert.ok(line, `Missing control: ${label}`);
  call(['click', ...scope, '--element-index', line.trim().split(' ')[0]]);
}
let tree = state();
if (tree.includes('초안 1개 · 이어서 만들기')) {
  click(tree, '초안 1개 · 이어서 만들기');
  await setTimeout(400);
  tree = state();
}
if (/모델은 아직 연결 전이라/.test(tree)) {
  click(tree, 'OK');
  await setTimeout(400);
  tree = state();
}
click(tree, '이 사진으로 계속');
for (let attempt = 0; attempt < 40; attempt++) {
  await setTimeout(500);
  tree = state();
  assert.ok(!/모델은 아직 연결 전이라/.test(tree), 'FAIL: imported photos stop at the unconnected-model guard.');
  if (/heading 선화 확인/.test(tree)) {
    console.log('PASS: an imported photo reaches line-art review.');
    process.exit(0);
  }
}
assert.fail('FAIL: an imported photo did not reach line-art review.');
