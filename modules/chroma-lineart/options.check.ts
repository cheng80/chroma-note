import { DEFAULT_LINE_ART_OPTIONS, resolveLineArtOptions } from './options.ts';

function check(ok: boolean) { if (!ok) throw new Error('line-art option check failed'); }
check(JSON.stringify(resolveLineArtOptions()) === '{"maxEdge":1024,"lineGain":1.8}');
check(resolveLineArtOptions({ maxEdge: 1536 }).lineGain === 1.8);
check(resolveLineArtOptions({ lineGain: 1 }).maxEdge === 1024);
check(resolveLineArtOptions({ maxEdge: 16, lineGain: 0.1 }).maxEdge === 16);
check(resolveLineArtOptions({ maxEdge: 1023, lineGain: 4 }).maxEdge === 1023);
check(Object.isFrozen(DEFAULT_LINE_ART_OPTIONS));
for (const options of [{ maxEdge: 0 }, { maxEdge: 1537 }, { maxEdge: 16.5 }, { maxEdge: NaN }, { lineGain: Infinity }, { lineGain: NaN }, { lineGain: 0 }, { lineGain: 4.01 }]) {
  let rejected = false;
  try { resolveLineArtOptions(options); } catch { rejected = true; }
  check(rejected);
}
console.log('line-art options passed: defaults, independent overrides, bounds, non-finite values');
