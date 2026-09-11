import { analysisModifiedFields, canonicalJson, decodeCursor, encodeCursor, isGeneratedLineArtUri, RecordError, sessionIdFromAccessToken, validCreateSelection } from './records-core.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const cursor = { diary_date: '2026-09-11', created_at: '2026-09-11T10:20:30.000Z', id: 'abc-123' };
equal(decodeCursor(encodeCursor(cursor)), cursor);
equal(canonicalJson({ z: 1, a: { b: 2, a: 3 } }), '{"a":{"a":3,"b":2},"z":1}');
try { decodeCursor('not-a-cursor'); throw new Error('invalid cursor should fail'); } catch (error) { if (!(error instanceof RecordError) || error.code !== 'validation') throw error; }
try { canonicalJson({ invalid: undefined }); throw new Error('undefined payload must fail'); } catch (error) { if (!(error instanceof RecordError) || error.code !== 'validation') throw error; }
equal(validCreateSelection({ candidate_id: 'sample', input_revision: 1, source: 'demo', local_uri: 'file://other.png' }, { candidate_id: 'sample', input_revision: 1 }), false);
const lineArtUri = 'file:///app/Documents/chroma-drafts/owner-a/lineart-123e4567-e89b-42d3-a456-426614174000.png';
equal(isGeneratedLineArtUri(lineArtUri, 'owner-a', 'file:///app/Documents/'), true);
equal(isGeneratedLineArtUri(lineArtUri, 'owner-b', 'file:///app/Documents/'), false);
equal(isGeneratedLineArtUri('file:///outside/chroma-drafts/owner-a/lineart-123e4567-e89b-42d3-a456-426614174000.png', 'owner-a', 'file:///app/Documents/'), false);
equal(isGeneratedLineArtUri('file:///app/Documents/chroma-drafts/owner-a/nested/lineart-123e4567-e89b-42d3-a456-426614174000.png', 'owner-a', 'file:///app/Documents/'), false);
equal(isGeneratedLineArtUri('file:///app/Documents/chroma-drafts/owner-a/%2e%2e/lineart-123e4567-e89b-42d3-a456-426614174000.png', 'owner-a', 'file:///app/Documents/'), false);
equal(isGeneratedLineArtUri('file:///app/Documents/chroma-drafts/owner-a/original.png', 'owner-a', 'file:///app/Documents/'), false);
equal(validCreateSelection({ candidate_id: 'sample', input_revision: 1, source: 'device', local_uri: lineArtUri }, { candidate_id: 'sample', input_revision: 1 }), true);
equal(validCreateSelection({ candidate_id: 'sample', input_revision: 1, source: 'device', local_uri: 'file:///app/Documents/chroma-drafts/owner-a/original.png' }, { candidate_id: 'sample', input_revision: 1 }), false);
equal(validCreateSelection({ candidate_id: 'sample', input_revision: 1, source: 'device', local_uri: lineArtUri }, { candidate_id: 'other', input_revision: 1 }), false);
equal(validCreateSelection({ candidate_id: 'sample', input_revision: 1, source: 'demo', local_uri: 'demo-stamp' }, { candidate_id: 'sample', input_revision: 1 }), false);
equal(sessionIdFromAccessToken('header.eyJzZXNzaW9uX2lkIjoic2Vzc2lvbi0xIn0.signature'), 'session-1');
try { sessionIdFromAccessToken('header.eyJzdWIiOiJvd25lciJ9.signature'); throw new Error('session id must be required'); } catch (error) { if (!(error instanceof RecordError) || error.code !== 'unauthorized') throw error; }
equal(analysisModifiedFields(
  { scene: '변경', semantic_tags: ['산책'], mood_tags: ['차분함', '따뜻함'], ai_field_note_edited: '수정문' },
  { scene: '원본', semantic_tags: ['산책'], mood: ['차분함'], ai_field_note_edited: null },
), ['scene', 'mood_tags', 'ai_field_note_edited']);
console.log('records.check passed');
