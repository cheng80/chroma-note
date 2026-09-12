import assert from 'node:assert/strict';
import { canWrapSemantically, joinSemanticParagraphs, nativeBreaks, prepareSemanticWrap, resolveSemanticWrap } from './semantic-wrap.ts';

const text = '더 나은 사용자 경험을 만드는 방법';
assert.equal(canWrapSemantically(text), true);
for (const value of ['', '제목', '직접\n줄바꿈', '공백  보존', ' 앞 공백', '긴 문장 '.repeat(40)]) assert.equal(canWrapSemantically(value), false);
assert.deepEqual(nativeBreaks(text, ['더 나은 사용자 ', '경험을 만드는 방법']), [8]);
assert.equal(nativeBreaks(text, ['다른 문장']), null);
const lines = ['더 나은 사용자 ', '경험을 만드는 방법'];
const input = prepareSemanticWrap(text, lines);
assert.ok(input);
assert.ok(input.samples.includes(text));
assert.ok(input.samples.includes(' '));
assert.ok(input.samples.includes('사용자 경험을'));
const widths = new Map(input.samples.map(value => [value, value.length]));
const result = resolveSemanticWrap(text, lines, 12, widths);
assert.equal(result, text, 'Keep the already balanced native layout.');
assert.equal(result.replaceAll('\n', ' '), text);
const uneven = ['더 나은 사용자 경험을 만드는', '방법'];
assert.equal(resolveSemanticWrap(text, uneven, 17, widths), '더 나은\n사용자 경험을 만드는 방법');
for (const width of [0, NaN, -1]) assert.equal(resolveSemanticWrap(text, lines, width, widths), text);
assert.equal(resolveSemanticWrap(text, lines, 12, new Map()), text);
assert.equal(resolveSemanticWrap(text, lines, 12, new Map(input.samples.map(sample => [sample, NaN]))), text);
assert.equal(resolveSemanticWrap(text, lines, 12, new Map(input.samples.map(sample => [sample, -1]))), text);
assert.equal(resolveSemanticWrap(text, lines, 12, widths, 1), text);
assert.equal(resolveSemanticWrap(text, [text], 100, widths), text);
const KoreanNotice = 'AI 변환 과정에서 일부 윤곽이나 세부 표현이 생략될 수 있어요.';
const splitKoreanNotice = ['AI 변환 과정에서 일부 윤곽이나 세부 표현이 생략될 수 있', '어요.'];
const KoreanNoticeInput = prepareSemanticWrap(KoreanNotice, splitKoreanNotice);
assert.ok(KoreanNoticeInput);
const KoreanNoticeWidths = new Map(KoreanNoticeInput.samples.map(sample => [sample, [...sample].reduce((total, character) => total + (character === ' ' ? 0.35 : 1), 0)]));
assert.equal(resolveSemanticWrap(KoreanNotice, splitKoreanNotice, 29, KoreanNoticeWidths), 'AI 변환 과정에서 일부 윤곽이나\n세부 표현이 생략될 수 있어요.');
const english = 'A familiar place with a new story to remember';
const englishLines = ['A familiar place with a new ', 'story to remember'];
const englishInput = prepareSemanticWrap(english, englishLines);
assert.ok(englishInput);
const englishWidths = new Map(englishInput.samples.map(value => [value, value.length]));
assert.equal(resolveSemanticWrap(english, englishLines, 27, englishWidths).replaceAll('\n', ' '), english);

// Preserve explicit separators, blank paragraphs and whitespace verbatim in one display string.
const paragraphs = `\r\n${text}\n\n  공백  보존 \r\n${english}\n \n`;
const parts = paragraphs.split(/(\r?\n)/u);
assert.equal(joinSemanticParagraphs(parts, new Map()), paragraphs);
assert.equal(joinSemanticParagraphs(parts, new Map([[2, '더 나은\n사용자 경험을 만드는 방법'], [8, 'A familiar place\nwith a new story to remember']])),
  `\r\n더 나은\n사용자 경험을 만드는 방법\n\n  공백  보존 \r\nA familiar place\nwith a new story to remember\n \n`);

const measure = value => value.length * 8;
function nativeLinesAtWidth(value, width) {
  const lines = [];
  let rest = value;
  while (measure(rest) > width) {
    const limit = Math.floor(width / 8);
    const space = rest.lastIndexOf(' ', limit);
    const end = space > 0 ? space : limit;
    lines.push(rest.slice(0, end));
    rest = rest.slice(end).replace(/^ /u, '');
  }
  return [...lines, rest];
}

for (const longText of [
  '오늘 남긴 사진과 메모를 다시 보며 익숙한 장소에서 찾은 새로운 이야기를 오래 기억하고 싶어요. '.repeat(50).slice(0, 2000).trimEnd(),
  'A familiar place with a new story to remember and a quiet afternoon spent walking beside the river. '.repeat(30).slice(0, 2000).trimEnd(),
]) {
  assert.ok(longText.length >= 1999);
  assert.equal(canWrapSemantically(longText), true, 'Long user bodies must enter semantic measurement.');
  // Portrait phone, unfolded container and tablet widths, then the original narrow width.
  let firstResult;
  for (const width of [320, 768, 1024, 320]) {
    const nativeLines = nativeLinesAtWidth(longText, width);
    const input = prepareSemanticWrap(longText, nativeLines);
    assert.ok(input?.nearby);
    const bound = 25 * (nativeLines.length - 2) + 10 + nativeLines.length + 2;
    assert.ok(input.samples.length <= bound, 'At most 5×5 transitions per adjacent native layer, plus native lines, space and full text.');
    const widths = new Map(input.samples.map(sample => [sample, measure(sample)]));
    const core = input.plan.select({ maxWidth: width, nativeLayout: { breaks: input.breaks }, measureText: sample => {
      assert.ok(widths.has(sample), `Missing native sample: ${sample}`);
      return widths.get(sample);
    } });
    const result = resolveSemanticWrap(longText, nativeLines, width, widths);
    assert.equal(result, core.applied && !core.overflow ? core.lines.join('\n') : longText);
    assert.equal(result.replaceAll('\n', ' '), longText);
    const displayedLines = result === longText ? nativeLines : result.split('\n');
    assert.equal(displayedLines.length, nativeLines.length, 'Nearby selection keeps native line count.');
    assert.ok(displayedLines.every(line => measure(line) <= width), 'Every selected line fits the current container.');
    if (width === 320) {
      if (firstResult === undefined) firstResult = result;
      else assert.equal(result, firstResult, 'Returning to the narrow width recomputes the same result.');
    }
    for (const invalid of [undefined, NaN, Infinity, -1]) {
      const invalidWidths = new Map(widths);
      if (invalid === undefined) invalidWidths.delete(longText);
      else invalidWidths.set(longText, invalid);
      assert.equal(resolveSemanticWrap(longText, nativeLines, width, invalidWidths), longText);
    }
    assert.equal(resolveSemanticWrap(longText, nativeLines, width, widths, nativeLines.length - 1), longText);
  }
  assert.equal(prepareSemanticWrap(longText, [longText]), null);
  assert.equal(resolveSemanticWrap(longText, ['Invalid native text'], 320, new Map()), longText);

  // Native breaks inside words must still anchor the long local search.
  const wordLines = Array.from({ length: Math.ceil(longText.length / 13) }, (_, index) => longText.slice(index * 13, (index + 1) * 13));
  const input = prepareSemanticWrap(longText, wordLines);
  assert.ok(input?.nearby);
  assert.ok(input.breaks.some(offset => !input.plan.aggregate().some(candidate => candidate.offset === offset)));
  const widths = new Map(input.samples.map(sample => [sample, measure(sample)]));
  assert.equal(resolveSemanticWrap(longText, wordLines, 1, widths), longText, 'No fitting local path preserves the original body.');
}

for (const value of ['a b c d e f g h i j k l m n o p q', `${'긴'.repeat(161)} 문장`]) {
  assert.equal(canWrapSemantically(value), true, 'Neither the word nor character limit bypasses wrapping.');
  assert.ok(prepareSemanticWrap(value, [value.slice(0, 1), value.slice(1)])?.nearby);
}
console.log('PASS: semantic-wrap short/long Korean/English, paragraph preservation, portrait width roundtrip, line fit/count, bounded probes and native fallbacks.');
