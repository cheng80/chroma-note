import { photoInputFailure } from './photo-input-core.ts';

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
}

equal(photoInputFailure({ message: 'photo_decode_failed' }).code, 'corrupt');
equal(photoInputFailure({ domain: 'NSURLErrorDomain', code: -1009 }).code, 'icloud_download_failed');
equal(photoInputFailure({ domain: 'NSCocoaErrorDomain', code: 640 }).code, 'storage_full');
equal(photoInputFailure({ domain: 'NSPOSIXErrorDomain', code: 28 }).code, 'storage_full');
equal(photoInputFailure({ message: 'photo_unsupported_format' }).code, 'unsupported');
equal(photoInputFailure({ message: 'photo_input_too_large' }).code, 'too_large');
equal(photoInputFailure({ message: 'Failed to read picked image', cause: { domain: 'NSURLErrorDomain', code: -1009 } }).code, 'icloud_download_failed');
const loop: { cause?: unknown } = {}; loop.cause = loop;
equal(photoInputFailure(loop).code, 'unknown');
equal(photoInputFailure({ message: 'server detail: secret' }).message.ko.includes('secret'), false);
console.log('photo-input-core.check passed');
