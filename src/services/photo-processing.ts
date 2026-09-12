import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { convertLineArt } from '../../modules/chroma-lineart';
import lineArtManifest from '../../modules/chroma-lineart/model-manifest.json';
import { extractPhotoColors } from '../../modules/chroma-lineart/palette';
import { analyzePhoto, preparePhotoAnalysis } from '../../modules/chroma-analysis';
import type { ActiveJob, DisplayLocale, PhotoInput, PhotoStepResult } from '../domain/record';

export async function processPhotoStep(photo: PhotoInput, job: ActiveJob, locale: DisplayLocale, signal: AbortSignal): Promise<PhotoStepResult> {
  const started = performance.now();
  let outcome = 'failed';
  try {
    const result = await executePhotoStep(photo, job, locale, signal);
    outcome = signal.aborted ? 'cancelled' : 'success';
    return result;
  } finally {
    if (__DEV__) console.info('[photo-timing]', JSON.stringify({ step: job.step, outcome: signal.aborted ? 'cancelled' : outcome, durationMs: Math.round(performance.now() - started), width: photo.width, height: photo.height }));
  }
}

async function executePhotoStep(photo: PhotoInput, job: ActiveJob, locale: DisplayLocale, signal: AbortSignal): Promise<PhotoStepResult> {
  if (photo.source !== 'device' || photo.input_revision !== job.input_revision || !new File(photo.local_uri).exists) throw new Error('photo_missing');
  if (signal.aborted) throw new Error('photo_cancelled');
  const input = { uri: photo.local_uri, inputRevision: photo.input_revision, locale };
  if (job.step === 'prepare') {
    await preparePhotoAnalysis(signal);
    return { step: 'prepare' };
  }
  if (job.step === 'colors') {
    const result = await extractPhotoColors(input, signal);
    return { step: 'colors', colors: { source: 'device', source_revision: photo.input_revision, tags: result.tags } };
  }
  if (job.step === 'analysis') {
    const result = await analyzePhoto(input, signal);
    return { step: 'analysis', analysis: { source: 'device', source_revision: result.inputRevision, status: 'success', model_version: result.modelVersion,
      scene: result.scene, semantic_tags: result.semanticTags, mood: result.moodTags, ai_field_note: '', ai_field_note_edited: null, user_modified_fields: [] } };
  }
  const directory = new Directory(Paths.document, 'chroma-drafts', job.owner_id);
  directory.create({ intermediates: true, idempotent: true });
  const result = await convertLineArt({ ...input, outputDirectory: directory.uri }, {}, signal);
  return { step: 'stamp', stamp: { source: 'device', candidate_id: randomUUID(), input_revision: result.inputRevision, local_uri: result.uri, width: result.width, height: result.height,
    processing: { model_id: 'informative-drawings/style1', revision: lineArtManifest.source.author_weights.revision, runtime_version: 'CoreML-iOS17', quantization: 'fp16', inference_duration_ms: result.durationMs,
      max_edge: result.options.maxEdge, mask_gain: result.options.lineGain, postprocess_version: 'source-rgb-mask-v1' } } };
}
