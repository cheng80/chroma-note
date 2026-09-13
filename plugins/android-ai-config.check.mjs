import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const module = { exports: {} };
const handlers = {};
vm.runInNewContext(readFileSync(new URL('./with-private-android-data.js', import.meta.url), 'utf8'), {
  module, require: () => ({
    AndroidConfig: { Manifest: { getMainApplicationOrThrow: (value) => value.application } },
    withAndroidManifest: (config, handler) => { handlers.manifest = handler; return config; },
    withGradleProperties: (config, handler) => { handlers.properties = handler; return config; },
  }),
});
module.exports({});
const manifest = { modResults: { application: { $: { 'android:allowBackup': 'true' } } } };
handlers.manifest(manifest);
assert.equal(manifest.modResults.application.$['android:allowBackup'], 'false');
assert.equal(manifest.modResults.application.$['android:fullBackupContent'], '@xml/chroma_backup_rules');
assert.equal(manifest.modResults.application.$['android:dataExtractionRules'], '@xml/chroma_data_extraction_rules');
let properties = { modResults: [{ type: 'property', key: 'reactNativeArchitectures', value: 'armeabi-v7a' }, { type: 'property', key: 'unchanged', value: 'yes' }] };
properties = handlers.properties(handlers.properties(properties));
assert.equal(properties.modResults.filter((item) => item.key === 'reactNativeArchitectures').length, 1);
assert.equal(properties.modResults.find((item) => item.key === 'reactNativeArchitectures').value, 'arm64-v8a,x86_64');
assert.equal(properties.modResults.find((item) => item.key === 'unchanged').value, 'yes');
console.log('PASS Android backup exclusion and reproducible 64-bit model configuration');
