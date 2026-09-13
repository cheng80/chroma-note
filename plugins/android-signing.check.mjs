import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { patchAppBuildGradle } = require('./with-android-signing');
const { removeGeneratedContents } = require('@expo/config-plugins/build/utils/generateCode');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const native = read('../android/app/build.gradle');
const original = removeGeneratedContents(native, 'chroma-android-signing') ?? native;
const patched = patchAppBuildGradle(original);
assert.equal(patchAppBuildGradle(patched), patched, 'prebuild must not duplicate signing configuration');
assert(patched.indexOf('android.buildTypes.release.signingConfig = android.signingConfigs.release') > patched.lastIndexOf('signingConfig signingConfigs.debug'));
assert.match(patched, /rootProject\.file\('\.\.\/key\.properties'\)/);
assert.match(patched, /it\.name == 'preReleaseBuild' \|\| it\.name == 'validateSigningRelease'/);
assert.throws(() => patchAppBuildGradle(original.replace(/^dependencies \{$/m, 'dependencies { // changed template')));
assert(JSON.parse(read('../app.json')).expo.plugins.includes('./plugins/with-android-signing'));
console.log('PASS Android signing root path, release override, validation wiring, prebuild idempotence and registration');
