import type { ColorTag } from './record';

export interface ColorSearch {
  hex: string;
  range: 'close' | 'similar' | 'wide';
  minWeight: 0.05 | 0.1 | 0.25;
}

// Presets only choose a target HEX. They do not classify or bucket source colors.
export const COLOR_PRESETS = [
  { id: 'red', hex: '#D94848', label: { ko: '빨강', en: 'Red' } },
  { id: 'orange', hex: '#E58A3A', label: { ko: '주황', en: 'Orange' } },
  { id: 'yellow', hex: '#E2C64A', label: { ko: '노랑', en: 'Yellow' } },
  { id: 'green', hex: '#5D9665', label: { ko: '초록', en: 'Green' } },
  { id: 'cyan', hex: '#45A9B0', label: { ko: '청록', en: 'Cyan' } },
  { id: 'blue', hex: '#527BC1', label: { ko: '파랑', en: 'Blue' } },
  { id: 'purple', hex: '#9164B7', label: { ko: '보라', en: 'Purple' } },
  { id: 'pink', hex: '#DD8EAB', label: { ko: '분홍', en: 'Pink' } },
  { id: 'brown', hex: '#98704D', label: { ko: '갈색', en: 'Brown' } },
  { id: 'white', hex: '#F4F2ED', label: { ko: '흰색', en: 'White' } },
  { id: 'gray', hex: '#929292', label: { ko: '회색', en: 'Gray' } },
  { id: 'black', hex: '#242424', label: { ko: '검정', en: 'Black' } },
] as const;

// Product starting values, not universal perceptual equivalence thresholds.
export const COLOR_SEARCH_RANGES = [
  { id: 'close', threshold: 0.06, label: { ko: '가깝게', en: 'Close' } },
  { id: 'similar', threshold: 0.10, label: { ko: '비슷하게', en: 'Similar' } },
  { id: 'wide', threshold: 0.16, label: { ko: '넓게', en: 'Wide' } },
] as const;

/** Accept 3/6 digit RGB HEX with optional #; return canonical #RRGGBB or null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  return `#${(hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex).toUpperCase()}`;
}

export function createColorSearch(hex: string): ColorSearch {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error('Invalid color search HEX.');
  return { hex: normalized, range: 'similar', minWeight: 0.1 };
}

export function isColorSearch(value: unknown): value is ColorSearch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).length === 3 && Object.keys(input).every((key) => ['hex', 'range', 'minWeight'].includes(key)) && normalizeHex(input.hex) !== null
    && COLOR_SEARCH_RANGES.some(({ id }) => id === input.range)
    && [0.05, 0.1, 0.25].some((weight) => weight === input.minWeight);
}

function hexRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** sRGB 0..255 → linear sRGB → OKLab, using Ottosson's 2021-01-25 matrices.
 * https://bottosson.github.io/posts/oklab/
 * https://www.w3.org/TR/css-color-4/#color-conversion-code
 * Keep matrix coefficients, operation order and boundary tolerance in SQL in sync.
 */
export function rgbToOklab(rgb: readonly [number, number, number]): [number, number, number] {
  if (!Array.isArray(rgb) || rgb.length !== 3 || rgb.some((c) => !Number.isFinite(c) || c < 0 || c > 255)) throw new Error('Invalid RGB color.');
  const [r, g, b] = rgb.map((c) => {
    const channel = c / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

export function colorMatchWeight(tags: readonly ColorTag[], search: ColorSearch): number {
  if (!isColorSearch(search)) throw new Error('Invalid color search.');
  const target = rgbToOklab(hexRgb(normalizeHex(search.hex)!));
  const radius = COLOR_SEARCH_RANGES.find(({ id }) => id === search.range)!.threshold;
  let weight = 0;
  for (const tag of tags) {
    if (!Number.isFinite(tag.weight) || tag.weight <= 0 || tag.weight > 1) continue;
    const lab = rgbToOklab(tag.rgb);
    // W3C deltaEOK Euclidean distance. 1e-12 only absorbs float round-off.
    const distance = Math.sqrt((lab[0] - target[0]) ** 2 + (lab[1] - target[1]) ** 2 + (lab[2] - target[2]) ** 2);
    if (distance <= radius + 1e-12) weight += tag.weight;
  }
  return weight;
}

export function matchesColorSearch(tags: readonly ColorTag[], search: ColorSearch): boolean {
  return colorMatchWeight(tags, search) >= search.minWeight - 1e-12;
}
