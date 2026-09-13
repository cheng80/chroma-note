import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { imageSource } from './record-copy.ts';

// Exercise the installed React Native Android source-to-native-props boundary.
const android = readFileSync(new URL('../../node_modules/react-native/Libraries/Image/Image.android.js', import.meta.url), 'utf8');
const start = android.indexOf('  if (Array.isArray(source_))');
const end = android.indexOf('  if (onLoadStart != null)', start);
assert.ok(start >= 0 && end > start, 'Review the Android header boundary after a React Native upgrade');
const nativePropsFor = new Function('source_', `const nativeProps = {}, styles = {}, style = {}, width = 100, height = 100; ${android.slice(start, end)} return nativeProps;`);
const uri = 'https://example.test/private/stamp.png';
const headers = { Authorization: 'Bearer test-only', apikey: 'test-only' };
const native = nativePropsFor(imageSource(uri, 7, headers));
assert.deepEqual(native.headers, headers, 'Android must receive private-image authentication headers');
assert.equal(native.source[0].uri, uri);
assert.equal(imageSource('', 7), 7);
assert.equal(imageSource('demo-stamp', 7), 7);
assert.equal(nativePropsFor(imageSource('file:///private/stamp.png', 7)).source[0].uri, 'file:///private/stamp.png');
console.log('record-copy.check passed: authenticated images reach the installed Android native header boundary; local and bundled images remain valid');
