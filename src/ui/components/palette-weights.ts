/** Converts measured color weights to display percentages without rounding drift. */
export function palettePercentages(weights: readonly number[]): number[] {
  if (!weights.length) return [];
  const values = weights.map((weight) => Number.isFinite(weight) && weight > 0 ? weight : 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return values.map((_, index) => index === 0 ? 100 : 0);

  const scaled = values.map((value, index) => ({ index, value: value / total * 100 }));
  const result = scaled.map(({ value }) => Math.floor(value));
  let remaining = 100 - result.reduce((sum, value) => sum + value, 0);
  const byFraction = [...scaled].sort((a, b) => (b.value % 1) - (a.value % 1) || a.index - b.index);
  for (let index = 0; remaining > 0; index = (index + 1) % byFraction.length, remaining -= 1) result[byFraction[index]!.index] += 1;
  return result;
}
