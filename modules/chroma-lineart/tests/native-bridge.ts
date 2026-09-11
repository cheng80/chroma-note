import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { convertLineArt } from '../index';

/** Run inside a development build; no account, user photo, or upload is used. */
export async function checkNativeLineArt() {
  const folder = new Directory(Paths.document, `lineart-check-${randomUUID()}`);
  folder.create();
  try {
    const asset = Asset.fromModule(require('../../../design/images/generated-1788887279815.png'));
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error('check_asset_missing');
    const photo = new File(folder, 'input.png');
    new File(asset.localUri).copy(photo);
    const input = { uri: photo.uri, outputDirectory: folder.uri, inputRevision: 7 };
    const result = await convertLineArt(input, { maxEdge: 256, lineGain: 1 });
    const output = new File(result.uri);
    const signature = Array.from((await output.bytes()).slice(0, 8)).join(',');
    if (signature !== '137,80,78,71,13,10,26,10' || result.uri === photo.uri || result.bytes !== output.size || result.width !== 256 || result.height >= 256 || result.inputRevision !== 7 || !photo.exists) throw new Error('check_result_invalid');
    // Exercise the native path guard, then ensure its failure releases the job.
    let rejected = false;
    try { await convertLineArt({ ...input, outputDirectory: 'file:///private/lineart-outside-app' }); }
    catch { rejected = true; }
    if (!rejected) throw new Error('check_path_not_rejected');
    const next = await convertLineArt(input, { maxEdge: 128, lineGain: 2 });
    if (next.width !== 128 || next.uri === result.uri || !output.exists) throw new Error('check_reuse_invalid');
    return `PASS: native bridge, PNG ${result.width}x${result.height}, options, path guard, model reuse, original/output preservation`;
  } finally {
    folder.delete();
  }
}
