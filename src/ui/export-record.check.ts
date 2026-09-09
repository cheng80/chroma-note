import { EXPORT_WIDTH_PX, MAX_EXPORT_HEIGHT_PX, exportCaptureSize, toLocalFileUri } from './export-record.ts';

const fullRecord = exportCaptureSize(360, 4000, 3);
if (fullRecord.kind !== 'ready') throw new Error('bounded long records should be exportable');
if (fullRecord.pixelWidth !== 1080 || fullRecord.pixelHeight !== 12000) throw new Error('export should preserve aspect ratio at 1080px');
if (fullRecord.width !== 360 || fullRecord.height !== 4000) throw new Error('capture dimensions should account for PixelRatio');
if (fullRecord.bitmapBytes !== EXPORT_WIDTH_PX * 12000 * 4) throw new Error('bitmap estimate should match RGBA memory');

const overLimit = exportCaptureSize(360, MAX_EXPORT_HEIGHT_PX / 3 + 1, 3);
if (overLimit.kind !== 'too-tall') throw new Error('oversized captures should fail instead of truncating');
if (exportCaptureSize(0, 100, 3).kind !== 'not-ready') throw new Error('blank layouts must not be captured');
if (toLocalFileUri('/tmp/record.png') !== 'file:///tmp/record.png') throw new Error('native paths need a file URI');
if (toLocalFileUri('content://record.png') !== 'content://record.png') throw new Error('existing URI schemes must be preserved');

console.log('export-record.check passed');
