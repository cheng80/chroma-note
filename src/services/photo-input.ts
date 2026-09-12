import { launchImageLibraryAsync, UIImagePickerPreferredAssetRepresentationMode } from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { PhotoInput } from '../domain/record';
export { photoInputFailure, type PhotoInputErrorCode, type PhotoInputFailure } from './photo-input-core';

type ImportedPhoto = PhotoInput & { captured_date?: string };
type NativePhotoImporter = {
  normalizePhotoAsync(uri: string, directory: string): Promise<{ uri: string; width: number; height: number; bytes: number; capturedDate?: string }>;
};

const OWNER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The system picker only grants the chosen image; no camera/library permission request. */
export async function pickPhoto(ownerId: string, revision: number): Promise<ImportedPhoto | null> {
  if (!OWNER_ID.test(ownerId)) throw new Error('invalid_owner');
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('invalid_revision');
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: false, exif: false, base64: false, quality: 1, preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Current, shouldDownloadFromNetwork: true });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  try {
    if (asset.type !== 'image') throw new Error('unsupported_photo');
    const directory = new Directory(Paths.document, 'chroma-drafts', ownerId);
    directory.create({ intermediates: true, idempotent: true });
    if (Platform.OS === 'ios') {
      const native = requireOptionalNativeModule<NativePhotoImporter>('ChromaLineArt');
      if (!native) throw new Error('native_build_required');
      const normalized = await native.normalizePhotoAsync(asset.uri, directory.uri);
      const root = new URL(directory.uri).pathname.replace(/\/$/, '') + '/';
      const output = new URL(normalized.uri);
      const owned = output.protocol === 'file:' && !output.host && output.pathname.startsWith(root);
      if (!owned ||
          !Number.isSafeInteger(normalized.width) || !Number.isSafeInteger(normalized.height) ||
          normalized.width < 1 || normalized.height < 1 || Math.max(normalized.width, normalized.height) > 2048) {
        if (owned) { const file = new File(normalized.uri); if (file.exists) file.delete(); }
        throw new Error('invalid_native_photo');
      }
      return { source: 'device', local_uri: normalized.uri, width: normalized.width, height: normalized.height,
        input_revision: revision, ...(normalized.capturedDate ? { captured_date: normalized.capturedDate } : {}) };
    }
    if (asset.width <= 0 || asset.height <= 0 || asset.width * asset.height > 50_000_000 ||
        (asset.fileSize ?? new File(asset.uri).size) > 30 * 1024 * 1024) throw new Error('unsupported_photo');
    const context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > 2048) context.resize(asset.width >= asset.height ? { width: 2048 } : { height: 2048 });
    const rendered = await context.renderAsync();
    const normalized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
    // This private working copy is never accepted by the record upload API.
    const file = new File(directory, `${randomUUID()}.jpg`);
    try { new File(normalized.uri).copy(file); }
    finally { new File(normalized.uri).delete(); }
    return { source: 'device', local_uri: file.uri, width: normalized.width, height: normalized.height,
      input_revision: revision };
  } finally {
    // Only the picker's app-cache copy is disposable; never touch a gallery URI.
    try {
      const picked = new URL(asset.uri);
      const cacheRoot = new URL(Paths.cache.uri).pathname.replace(/\/$/, '') + '/';
      if (picked.protocol === 'file:' && !picked.host && !picked.search && !picked.hash && picked.pathname.startsWith(cacheRoot)) {
        const cached = new File(asset.uri);
        if (cached.exists) cached.delete();
      }
    } catch { /* The OS can reclaim a cache copy if immediate cleanup fails. */ }
  }
}

export function removeWorkingPhoto(ownerId: string, photo: PhotoInput) {
  if (!OWNER_ID.test(ownerId) || !Number.isSafeInteger(photo.input_revision) || photo.input_revision < 1) return;
  const root = new Directory(Paths.document, 'chroma-drafts', ownerId).uri.replace(/\/$/, '') + '/';
  if (photo.source !== 'device' || !photo.local_uri.startsWith(root)) return;
  const file = new File(photo.local_uri);
  if (file.exists) file.delete();
}
