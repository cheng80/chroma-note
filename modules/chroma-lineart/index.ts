import { requireOptionalNativeModule } from 'expo';

import { resolveLineArtOptions, type LineArtOptions } from './options.ts';

export { DEFAULT_LINE_ART_OPTIONS, resolveLineArtOptions, type LineArtOptions } from './options.ts';

export type LineArtInput = Readonly<{
  uri: string;
  /** Existing draft-owned directory under the app's Documents directory. */
  outputDirectory: string;
  inputRevision: number;
}>;

export type LineArtResult = Readonly<{
  uri: string;
  width: number;
  height: number;
  bytes: number;
  durationMs: number;
  inputRevision: number;
  options: LineArtOptions;
}>;

type NativeLineArt = {
  begin(): string;
  convertAsync(jobId: string, uri: string, outputDirectory: string, options: LineArtOptions): Promise<Omit<LineArtResult, 'inputRevision' | 'options'>>;
  cancel(jobId: string): void;
  discardResult(uri: string): Promise<void>;
};

/** iOS development build only. No network, VLM, palette, or example-image fallback. */
export async function convertLineArt(input: LineArtInput, options: Partial<LineArtOptions> = {}, signal?: AbortSignal): Promise<LineArtResult> {
  const { uri, outputDirectory, inputRevision } = input;
  const resolved = resolveLineArtOptions(options);
  if (!Number.isSafeInteger(inputRevision) || inputRevision < 1) throw new Error('lineart_invalid_revision');
  for (const path of [uri, outputDirectory]) {
    const url = new URL(path);
    if (url.protocol !== 'file:' || url.host || url.search || url.hash) throw new Error('lineart_local_file_required');
  }
  if (signal?.aborted) throw new Error('lineart_cancelled');
  const native = requireOptionalNativeModule<NativeLineArt>('ChromaLineArt');
  if (!native) throw new Error('lineart_native_build_required');
  const jobId = native.begin();
  const cancel = () => native.cancel(jobId);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const result = await native.convertAsync(jobId, uri, outputDirectory, resolved);
    if (signal?.aborted) {
      await native.discardResult(result.uri);
      throw new Error('lineart_cancelled');
    }
    return { ...result, inputRevision, options: resolved };
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
