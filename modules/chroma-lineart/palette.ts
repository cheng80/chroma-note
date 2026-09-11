import { requireOptionalNativeModule } from 'expo';

export const PALETTE_ALGORITHM_VERSION = 'rgb-bin-v1';

export type PhotoColorInput = Readonly<{
  uri: string;
  inputRevision: number;
}>;

export type PhotoColorTag = {
  hex: string;
  rgb: [number, number, number];
  weight: number;
};

export type PhotoColorResult = {
  tags: PhotoColorTag[];
  inputRevision: number;
  algorithmVersion: typeof PALETTE_ALGORITHM_VERSION;
};

type NativePalette = {
  extractPaletteAsync(uri: string): Promise<PhotoColorTag[]>;
};

/** iOS development build only. Uses actual photo pixels; no VLM or fixture fallback. */
export async function extractPhotoColors(input: PhotoColorInput, signal?: AbortSignal): Promise<PhotoColorResult> {
  const { uri, inputRevision } = input;
  if (!Number.isSafeInteger(inputRevision) || inputRevision < 1) throw new Error('palette_invalid_revision');
  const url = new URL(uri);
  if (url.protocol !== 'file:' || url.host || url.search || url.hash) throw new Error('palette_local_file_required');
  if (signal?.aborted) throw new Error('palette_cancelled');
  const native = requireOptionalNativeModule<NativePalette>('ChromaLineArt');
  if (!native) throw new Error('palette_native_build_required');
  const tags = await native.extractPaletteAsync(uri);
  if (signal?.aborted) throw new Error('palette_cancelled');
  return { tags, inputRevision, algorithmVersion: PALETTE_ALGORITHM_VERSION };
}
