const { withAppBuildGradle } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

function patchAppBuildGradle(contents) {
  return mergeContents({
    src: contents,
    tag: 'chroma-android-signing',
    anchor: /^dependencies \{$/m,
    offset: 0,
    comment: '//',
    newSrc: `// Read credentials at build time; never copy them into generated native files.
def chromaKeyPropertiesFile = rootProject.file('../key.properties')
def chromaKeyProperties = new Properties()
if (chromaKeyPropertiesFile.isFile()) {
    chromaKeyPropertiesFile.withInputStream { chromaKeyProperties.load(it) }
}
android.signingConfigs.create('release') {
    def keyPath = chromaKeyProperties.getProperty('storeFile')
    storeFile = keyPath ? chromaKeyPropertiesFile.parentFile.toPath().resolve(keyPath).toFile() : null
    storePassword = chromaKeyProperties.getProperty('storePassword')
    keyAlias = chromaKeyProperties.getProperty('keyAlias')
    keyPassword = chromaKeyProperties.getProperty('keyPassword')
}
android.buildTypes.release.signingConfig = android.signingConfigs.release

// Debug builds remain available without local release credentials.
def validateChromaSigning = tasks.register('validateChromaReleaseSigning') {
    doLast {
        if (!chromaKeyPropertiesFile.isFile()) {
            throw new GradleException('Android release requires key.properties in the project root.')
        }
        ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'].each { key ->
            if (!chromaKeyProperties.getProperty(key)?.trim()) {
                throw new GradleException('Missing Android release signing property: ' + key)
            }
        }
        if (!android.signingConfigs.release.storeFile.isFile()) {
            throw new GradleException('Android release keystore was not found. Check storeFile in key.properties.')
        }
    }
}
tasks.matching { it.name == 'preReleaseBuild' || it.name == 'validateSigningRelease' }.configureEach {
    dependsOn(validateChromaSigning)
}`,
  }).contents;
}

module.exports = (config) => withAppBuildGradle(config, (config) => {
  if (config.modResults.language !== 'groovy') throw new Error('Android signing requires the SDK 57 Groovy build.gradle.');
  config.modResults.contents = patchAppBuildGradle(config.modResults.contents);
  return config;
});
module.exports.patchAppBuildGradle = patchAppBuildGradle;
