import { createLineBreakPlan } from '@semantic-wrap/core';
import { koTitleModel } from '@semantic-wrap/ko';
import { enTitleModel } from '@semantic-wrap/en';

export function canWrapSemantically(text: string) {
  // ponytail: O(words²) native measurements; only short UI copy, not record bodies.
  return text.length <= 160 && text === text.trim() && !/[^\S ]| {2}/u.test(text)
    && text.includes(' ') && text.split(' ').length <= 16;
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
  const plan = createLineBreakPlan({ text, model: /[ㄱ-ㅎㅏ-ㅣ가-힣]/u.test(text) ? koTitleModel : enTitleModel });
  const ends = [...plan.aggregate().map(candidate => candidate.offset), text.length];
  const samples = new Set([' ', ...lines.map(line => line.trim())]);
  for (let startIndex = 0; startIndex < ends.length; startIndex++) {
    const start = startIndex === 0 ? 0 : ends[startIndex - 1] + 1;
    for (let endIndex = startIndex; endIndex < ends.length; endIndex++) {
      samples.add(text.slice(start, ends[endIndex]));
    }
  }
  return { plan, breaks, samples: [...samples] };
}

export function resolveSemanticWrap(text: string, nativeLines: readonly string[], width: number, widths: ReadonlyMap<string, number>, numberOfLines = 0) {
  const input = prepareSemanticWrap(text, nativeLines);
  if (!input || !Number.isFinite(width) || width <= 0 || (numberOfLines > 0 && nativeLines.length > numberOfLines)) return text;
  try {
    const semanticOffsets = new Set(input.plan.aggregate().map(candidate => candidate.offset));
    // A native Korean character break can split one word. Let the model choose instead.
    const nativeLayout = input.breaks.every(offset => semanticOffsets.has(offset)) ? { breaks: input.breaks } : undefined;
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
