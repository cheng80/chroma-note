import { createLineBreakPlan, createLineBreakStrategy, nearbyLayouts } from '@semantic-wrap/core';
import { koTitleModel } from '@semantic-wrap/ko';
import { enTitleModel } from '@semantic-wrap/en';

// ponytail: long paragraphs search native ±2 neighborhoods, not the global optimum; widen only if needed.
const nearbyStrategy = createLineBreakStrategy({ calculate: nearbyLayouts({ radius: 2 }) });

export function canWrapSemantically(text: string) {
  return text === text.trim() && !/[^\S ]| {2}/u.test(text) && text.includes(' ');
}

export function joinSemanticParagraphs(parts: readonly string[], selections: ReadonlyMap<number, string>) {
  return parts.map((part, index) => index % 2 === 0 ? selections.get(index) ?? part : part).join('');
}

export function nativeBreaks(text: string, lines: readonly string[]) {
  const breaks: number[] = [];
  let offset = 0;
  for (const [index, line] of lines.entries()) {
    const value = line.trim();
    if (!value || !text.startsWith(value, offset)) return null;
    offset += value.length;
    if (index < lines.length - 1) breaks.push(offset);
    while (text[offset] === ' ') offset++;
  }
  return offset === text.length ? breaks : null;
}

export function prepareSemanticWrap(text: string, lines: readonly string[]) {
  if (!canWrapSemantically(text) || lines.length < 2) return null;
  const breaks = nativeBreaks(text, lines);
  if (!breaks) return null;
  const nearby = text.length > 160 || text.split(' ').length > 16;
  const plan = createLineBreakPlan({ text, model: /[ㄱ-ㅎㅏ-ㅣ가-힣]/u.test(text) ? koTitleModel : enTitleModel,
    strategy: nearby ? nearbyStrategy : undefined });
  const offsets = plan.aggregate().map(candidate => candidate.offset);
  const samples = new Set([' ', text, ...lines.map(line => line.trim())]);
  if (nearby) {
    // Match core 0.4.0 nearby-layouts.js: lower_bound ±2, including an exact anchor.
    const layers = [[0], ...breaks.map(offset => {
      let low = 0;
      let high = offsets.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (offsets[middle] < offset) low = middle + 1;
        else high = middle;
      }
      return offsets.slice(Math.max(0, low - 2), low + 2 + Number(offsets[low] === offset));
    }), [text.length]];
    for (let layer = 0; layer < layers.length - 1; layer++) {
      for (const offset of layers[layer]) {
        const start = offset + Number(text[offset] === ' ');
        for (const end of layers[layer + 1]) {
          if (end > start) samples.add(text.slice(start, end));
        }
      }
    }
  } else {
    const ends = [...offsets, text.length];
    for (let startIndex = 0; startIndex < ends.length; startIndex++) {
      const start = startIndex === 0 ? 0 : ends[startIndex - 1] + 1;
      for (let endIndex = startIndex; endIndex < ends.length; endIndex++) {
        samples.add(text.slice(start, ends[endIndex]));
      }
    }
  }
  return { plan, breaks, nearby, samples: [...samples] };
}

export function resolveSemanticWrap(text: string, nativeLines: readonly string[], width: number, widths: ReadonlyMap<string, number>, numberOfLines = 0) {
  const input = prepareSemanticWrap(text, nativeLines);
  if (!input || !Number.isFinite(width) || width <= 0 || (numberOfLines > 0 && nativeLines.length > numberOfLines)) return text;
  try {
    for (const sample of input.samples) {
      const measured = widths.get(sample) ?? NaN;
      if (!Number.isFinite(measured) || measured < 0) return text;
    }
    const semanticOffsets = new Set(input.plan.aggregate().map(candidate => candidate.offset));
    // Short Korean copy can use the global search to repair a break inside a word.
    // Long copy always needs native breaks, including non-semantic offsets, to stay local.
    const nativeLayout = input.nearby || input.breaks.every(offset => semanticOffsets.has(offset)) ? { breaks: input.breaks } : undefined;
    const result = input.plan.select({
      maxWidth: width,
      nativeLayout,
      measureText: value => widths.get(value) ?? NaN,
    });
    return result.applied && !result.overflow ? result.lines.join('\n') : text;
  } catch {
    // Missing/invalid native metrics must never hide or alter the original copy.
    return text;
  }
}
