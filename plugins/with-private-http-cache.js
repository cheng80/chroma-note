const { readFileSync } = require('node:fs');
const { withAppDelegate } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

// SDK 57 Swift AppDelegate: run before React Native or Expo creates a session.
function patchAppDelegate(contents) {
  const merge = (src, tag, newSrc, anchor) => mergeContents({ src, tag, newSrc, anchor, offset: 0, comment: '//' }).contents;
  const native = readFileSync(require.resolve('./private-http-cache.swift'), 'utf8').trim();
  contents = merge(contents, 'chroma-http-cache-helper', native, /^@main$/m);
  return merge(contents, 'chroma-http-cache-startup', `    do {
      try ChromaHTTPPrivacy.configure(
        cachesDirectory: FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: false),
        documentsDirectory: FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: false),
        bundleIdentifier: Bundle.main.bundleIdentifier ?? "")
    } catch {
      // Fail closed without logging request data or filesystem error details.
      fatalError("http_cache_privacy_setup_failed")
    }`, /^\s*let delegate = ReactNativeDelegate\(\)$/m);
}

module.exports = (config) => withAppDelegate(config, (config) => {
  if (config.modResults.language !== 'swift') throw new Error('HTTP cache privacy requires the SDK 57 Swift AppDelegate.');
  config.modResults.contents = patchAppDelegate(config.modResults.contents);
  return config;
});
module.exports.patchAppDelegate = patchAppDelegate;
