// Local experiment: native inference is real; only Expo transport is replaced by stdin/stdout.
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const moduleDir = path.join(root, 'modules/chroma-analysis');
const dataDir = path.join(root, 'experiments/model-selection/data');
const { values } = parseArgs({ options: {
  out: { type: 'string' }, device: { type: 'string', default: '690514C8-D269-4B41-82C2-1DCBA643C8C6' },
  models: { type: 'string', default: 'lfm,qwen' },
  concise: { type: 'boolean', default: false },
} });
assert(values.out, '--out must be a new results directory');
const out = path.resolve(values.out);
assert(!fs.existsSync(out), 'Do not overwrite an earlier comparison');
fs.mkdirSync(out, { recursive: true });
const json = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
const hash = async (filename) => {
  const digest = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) digest.update(chunk);
  return digest.digest('hex');
};
const source = fs.readFileSync(path.join(moduleDir, 'index.ts'), 'utf8');
const concisePrompts = {
  analyzePhoto: '사진에서 보이는 사물과 분위기를 한국어로 쓰세요. JSON만 출력하세요: {"scene":"짧은 설명","semantic_tags":["사물1","사물2","사물3"],"mood":["분위기"],"ai_field_note":""}. 태그는 중복 없이 3개, 분위기는 1개. 사진에 없는 사실을 만들지 마세요.',
  generatePhotoNote: '사진의 빛, 색, 형태를 담은 한국어 문구 하나를 8~20자로 쓰세요. 사진에 없는 사실은 쓰지 마세요. 설명 없이 다음 JSON만 출력하세요: {"ai_field_note":"문구"}.',
};
let promptSource = source;
if (values.concise) {
  for (const [fn, prompt] of Object.entries(concisePrompts)) {
    const start = promptSource.indexOf(`export async function ${fn}(`);
    assert(start >= 0);
    const end = promptSource.indexOf('\n}', start) + 2;
    const original = promptSource.slice(start, end);
    let replacements = 0;
    const changed = original.replace(/const (prompt|repairPrompt) = input.locale === 'ko'[\s\S]*?;\n/g,
      (_, variable) => { replacements++; return `const ${variable} = ${JSON.stringify(prompt)};\n`; });
    assert.equal(replacements, 2, 'Must replace only the primary and repair prompt');
    promptSource = promptSource.slice(0, start) + changed + promptSource.slice(end);
  }
}
const bridge = path.join(moduleDir, 'ios/ChromaAnalysisBridge.mm');
const harness = path.join(root, 'experiments/model-selection/ios-vlm-bench.mm');
const libDir = path.join(moduleDir, 'ios/Libraries/iphonesimulator/lib');
const binary = path.join(out, 'vlm-bench');
const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim();
execFileSync('xcrun', ['--sdk', 'iphonesimulator', 'clang++', '-O2', '-std=c++17', '-fobjc-arc',
  '-isysroot', sdk, '-target', 'arm64-apple-ios17.0-simulator', '-framework', 'Foundation',
  '-framework', 'Accelerate', '-framework', 'ImageIO', '-I' + path.join(moduleDir, 'ios'),
  '-I' + path.join(moduleDir, 'ios/Libraries/include'), harness, bridge,
  ...fs.readdirSync(libDir).filter(x => x.endsWith('.a')).map(x => path.join(libDir, x)), '-o', binary],
  { stdio: 'inherit' });
execFileSync('codesign', ['--force', '--sign', '-', binary], { stdio: 'inherit' });

const baseline = JSON.parse(fs.readFileSync(path.join(moduleDir, 'model-manifest.json')));
const lfmDir = path.join(dataDir, 'ios-smoke/lfm2.5-vl-450m');
const lfm = JSON.parse(fs.readFileSync(path.join(lfmDir, 'manifest.json')));
const models = {
  qwen: { manifest: baseline, dir: path.join(moduleDir, 'ios/Resources') },
  lfm: { manifest: { ...baseline, model_id: 'LiquidAI/LFM2.5-VL-450M', quantization: 'Q4_K_M',
    model_revision: lfm.revision, files: { model: lfm.files[0], vision: lfm.files[1] } }, dir: lfmDir },
};
const photos = await Promise.all([1, 2, 3, 4, 5].map(async (n) => {
  const id = `p${String(n).padStart(3, '0')}`;
  const image = path.join(dataDir, `photos/${id}.jpg`);
  return { id, image, sha256: await hash(image) };
}));
json('environment.json', { created_at: new Date().toISOString(), device: values.device, sdk,
  simulator: true, app_bridge_sha256: await hash(bridge), app_index_sha256: await hash(path.join(moduleDir, 'index.ts')),
  output_contract_sha256: await hash(path.join(moduleDir, 'output-contract.ts')), harness_sha256: await hash(harness),
  runtime_revision: baseline.runtime_revision, photos, sequence: values.models.split(','),
  prompt_profile: values.concise ? 'concise-control-v1' : baseline.prompt_version,
  concise_prompts: values.concise ? concisePrompts : null,
  scope: 'Same native app bridge, prompts, parsers and one-repair policy. No Expo transport, Swift manifest validation, UI or lineart timings. Model load timing excludes SHA-256 checks. Peak RSS is process-wide, not whole-app memory.' });

for (const name of values.models.split(',')) {
  assert(models[name], `Unknown model: ${name}`);
  const { manifest, dir } = models[name];
  const modelFiles = Object.values(manifest.files);
  for (const f of modelFiles) {
    assert.equal(fs.statSync(path.join(dir, f.name)).size, f.bytes);
    assert.equal(await hash(path.join(dir, f.name)), f.sha256);
  }
  const child = spawn('xcrun', ['simctl', 'spawn', values.device, binary,
    ...modelFiles.map(f => path.join(dir, f.name))], { stdio: ['pipe', 'pipe', 'pipe'] });
  const log = fs.createWriteStream(path.join(out, `${name}-native.log`));
  child.stderr.pipe(log);
  let pending;
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    if (!pending) return;
    try { const result = JSON.parse(line); pending.resolve(result); pending = undefined; }
    catch { log.write(line + '\n'); }
  });
  const exit = new Promise((resolve) => child.once('exit', (code, signal) => {
    pending?.reject(new Error(`native_exit:${code}:${signal}`)); pending = undefined; resolve(code);
  }));
  child.on('error', (error) => pending?.reject(error));
  const rpc = (request) => new Promise((resolve, reject) => {
    assert(!pending, 'Native requests must be sequential');
    pending = { resolve, reject };
    child.stdin.write(JSON.stringify(request) + '\n');
  });
  let current;
  let job = 0;
  const results = { model: manifest, prepare: null, cases: [] };
  globalThis.__chromaBenchNative = {
    begin: () => String(++job),
    cancel: () => child.kill('SIGTERM'),
    prepareJobAsync: async () => {
      const response = await rpc({ op: 'prepare' });
      results.prepare = response;
      if (response.error) throw new Error(response.error);
      return { ready: true };
    },
    generateAsync: async (_job, uri, prompt, maxTokens) => {
      const response = await rpc({ op: 'generate', image: fileURLToPath(uri), prompt, maxTokens });
      current.attempts.push({ prompt, maxTokens, ...response });
      if (response.error) throw new Error(response.error);
      return { text: response.value, durationMs: response.duration_ms };
    },
  };
  let runtime = promptSource
    .replace("import { requireOptionalNativeModule } from 'expo';", 'const requireOptionalNativeModule = () => globalThis.__chromaBenchNative;')
    .replace("import manifest from './model-manifest.json';", `const manifest = ${JSON.stringify(manifest)};`)
    .replace("from './output-contract'", `from ${JSON.stringify(pathToFileURL(path.join(moduleDir, 'output-contract.ts')).href)}`);
  assert(!runtime.includes("from 'expo'"), 'Expo transport replacement failed');
  runtime = ts.transpileModule(runtime, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = await import(`data:text/javascript;base64,${Buffer.from(runtime).toString('base64')}`);
  try {
    await api.preparePhotoAnalysis();
    console.log(`${name}: load ${(results.prepare.duration_ms / 1000).toFixed(3)}s`);
    for (const photo of photos) for (const task of ['analysis', 'caption']) {
      current = { photo_id: photo.id, task, locale: 'ko', attempts: [] };
      const start = performance.now();
      try {
        current.output = await api[task === 'analysis' ? 'analyzePhoto' : 'generatePhotoNote']({
          uri: pathToFileURL(photo.image).href, inputRevision: 1, locale: 'ko' });
      } catch (error) { current.error = error.message; }
      current.total_ms = performance.now() - start;
      results.cases.push(current);
      json(`${name}.json`, results);
      console.log(`${name} ${photo.id} ${task}: ${(current.total_ms / 1000).toFixed(3)}s, attempts=${current.attempts.length}, ${current.error ?? 'PASS'}`);
    }
  } catch (error) {
    results.error = error.message;
  } finally {
    json(`${name}.json`, results);
    child.stdin.end();
    if (pending) child.kill('SIGTERM');
    await exit;
    lines.close();
  }
}
