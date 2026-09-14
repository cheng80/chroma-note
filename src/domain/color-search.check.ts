import { COLOR_PRESETS, COLOR_SEARCH_RANGES, colorMatchWeight, createColorSearch, isColorSearch, matchesColorSearch, normalizeHex, rgbToOklab, type ColorSearch } from './color-search.ts';
import type { ColorTag } from './record.ts';

const assert = {
  equal(actual: unknown, expected: unknown, message = 'unexpected value') { if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`); },
  near(actual: number, expected: number, epsilon = 1e-9) { if (Math.abs(actual - expected) > epsilon) throw new Error(`expected ${expected}, got ${actual}`); },
};
const tag = (rgb: [number, number, number], weight = 1): ColorTag => ({ hex: '#000000', rgb, weight });
const hexRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const distanceFromBlack = (channel: number) => Math.sqrt(rgbToOklab([channel, channel, channel]).reduce((sum, c) => sum + c * c, 0));

assert.equal(normalizeHex(' f0a '), '#FF00AA');
assert.equal(normalizeHex('#a0b1c2'), '#A0B1C2');
assert.equal(normalizeHex('#ABC'), '#AABBCC');
for (const invalid of ['', '#', '#ab', '#1234', '#12345678', 'rgb(0 0 0)', '#GGHHII', null, 255]) assert.equal(normalizeHex(invalid), null);
assert.equal(JSON.stringify(createColorSearch('#abc')), JSON.stringify({ hex: '#AABBCC', range: 'similar', minWeight: 0.1 }));
for (const invalid of [null, {}, [], { hex: '#ffffff', range: 'similar', minWeight: 0.2 }, { hex: '#ffffff', range: 'same', minWeight: 0.1 }, { hex: '#ffffff', range: 'similar', minWeight: '0.1' }, { ...createColorSearch('#fff'), extra: true }]) assert.equal(isColorSearch(invalid), false);
assert.equal(isColorSearch(createColorSearch('#fff')), true);
try { createColorSearch('#oops'); throw new Error('invalid HEX accepted'); } catch (e) { assert.equal((e as Error).message, 'Invalid color search HEX.'); }

// Independent known values, including sRGB's nonlinear transfer on middle gray.
const samples: [[number, number, number], [number, number, number]][] = [
  [[0, 0, 0], [0, 0, 0]], [[255, 255, 255], [1, 0, 0]],
  [[255, 0, 0], [0.62795536, 0.22486306, 0.12584630]],
  [[0, 255, 0], [0.86643961, -0.23388757, 0.17949848]],
  [[0, 0, 255], [0.45201372, -0.03245698, -0.31152815]],
  [[128, 128, 128], [0.5998708, 0, 0]],
];
for (const [rgb, expected] of samples) rgbToOklab(rgb).forEach((c, i) => assert.near(c, expected[i], 1e-7));
assert.equal(COLOR_PRESETS.length, 12);
for (const preset of COLOR_PRESETS) {
  const search = createColorSearch(preset.hex);
  assert.equal(colorMatchWeight([tag(hexRgb(preset.hex))], search), 1);
  assert.equal(matchesColorSearch([tag(hexRgb(preset.hex))], { hex: preset.hex, range: 'similar', minWeight: 0.1 }), true, 'presets and arbitrary targets are identical');
}

export const colorSearchBoundaryCases: { tags: ColorTag[]; search: ColorSearch; expected: boolean }[] = [];
for (const { id, threshold } of COLOR_SEARCH_RANGES) {
  // A grayscale axis lets us place samples immediately inside, exactly at, and
  // immediately outside each radius without relying on rounded display HEX.
  for (const offset of [-1e-8, 0, 1e-8]) {
    let low = 0, high = 255;
    for (let i = 0; i < 80; i++) {
      const mid = (low + high) / 2;
      if (distanceFromBlack(mid) < threshold + offset) low = mid; else high = mid;
    }
    const channel = (low + high) / 2;
    const entry = { tags: [tag([channel, channel, channel])], search: { hex: '#000000', range: id, minWeight: 0.1 } as ColorSearch, expected: offset <= 0 };
    colorSearchBoundaryCases.push(entry);
    assert.equal(matchesColorSearch(entry.tags, entry.search), entry.expected, `${id} distance boundary`);
  }
}
const red = createColorSearch('#FF0000');
const colors = [tag([255, 0, 0], 0.01), tag([240, 0, 0], 0.09), tag([0, 0, 255], 0.9)];
const original = JSON.stringify(colors);
colors.forEach((t) => { Object.freeze(t.rgb); Object.freeze(t); }); Object.freeze(colors);
assert.near(colorMatchWeight(colors, red), 0.1);
assert.equal(matchesColorSearch(colors, red), true);
assert.equal(JSON.stringify(colors), original);
assert.equal(colorMatchWeight([], red), 0);
assert.equal(matchesColorSearch([], red), false);
assert.equal(matchesColorSearch([tag([255, 0, 0], 0.1)], { ...red, minWeight: 0.25 }), false);
assert.equal(matchesColorSearch([tag([255, 0, 0], 0.1)], { ...red, minWeight: 0.05 }), true);
for (const minWeight of [0.05, 0.1, 0.25] as const) for (const offset of [-1e-9, 0, 1e-9]) {
  const entry = { tags: [tag([255, 0, 0], minWeight + offset)], search: { ...red, minWeight }, expected: offset >= 0 };
  colorSearchBoundaryCases.push(entry);
  assert.equal(matchesColorSearch(entry.tags, entry.search), entry.expected, 'minimum coverage boundary');
}
console.log('color-search.check passed: reference colors, 12 presets, HEX validation, distance/coverage boundaries, duplicate weights and preservation');
