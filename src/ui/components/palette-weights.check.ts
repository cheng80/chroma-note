import { palettePercentages } from './palette-weights.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const [input, expected] of [
  [[0.58, 0.42], [58, 42]],
  [[1, 1, 1], [34, 33, 33]],
  [[0, 0], [100, 0]],
] as const) {
  const result = palettePercentages(input);
  assert(result.reduce((sum, value) => sum + value, 0) === 100, 'palette percentages must sum to 100');
  assert(JSON.stringify(result) === JSON.stringify(expected), 'palette rounding must be deterministic');
}
console.log('palette-weights.check passed');
