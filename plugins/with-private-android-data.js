const { AndroidConfig, withAndroidManifest, withGradleProperties } = require('expo/config-plugins');

module.exports = (config) => withAndroidManifest(withGradleProperties(config, (config) => {
  // The 2.5GB mmap model requires a 64-bit process.
  config.modResults = config.modResults.filter((item) => item.key !== 'reactNativeArchitectures');
  config.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value: 'arm64-v8a,x86_64' });
  return config;
}), (config) => {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
  application.$['android:allowBackup'] = 'false';
  application.$['android:fullBackupContent'] = '@xml/chroma_backup_rules';
  application.$['android:dataExtractionRules'] = '@xml/chroma_data_extraction_rules';
  return config;
});
