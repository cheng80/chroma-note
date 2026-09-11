import { adaptDescription } from './ontology.ts';

const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

equal(adaptDescription('A warm coffee cup sits on a wooden table by a window.', 'ko'),
  { scene: '커피, 컵, 테이블 장면', semanticTags: ['커피', '컵', '테이블', '창문'], moodTags: ['따뜻함'] });
equal(adaptDescription('A worker drinking coffee at a cafe in Paris.', 'en').semanticTags, ['coffee', 'cafe']);
try {
  adaptDescription('Unknown abstract pixels.', 'ko');
  throw new Error('expected analysis_unrecognized');
} catch (error) {
  if (!(error instanceof Error) || error.message !== 'analysis_unrecognized') throw error;
}
console.log('chroma-analysis ontology check passed');
