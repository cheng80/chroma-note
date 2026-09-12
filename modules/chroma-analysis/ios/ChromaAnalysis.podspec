Pod::Spec.new do |s|
  s.name = 'ChromaAnalysis'
  s.version = '1.0.0'
  s.summary = 'Local photo analysis for Chroma Note'
  s.description = s.summary
  s.author = 'Chroma Note'
  s.homepage = 'https://github.com/ggml-org/llama.cpp'
  s.license = { :type => 'MIT' }
  s.source = { :path => '.' }
  s.platform = :ios, '17.0'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.{swift,h,mm}'
  s.public_header_files = 'ChromaAnalysisBridge.h'
  s.resource_bundles = { 'ChromaAnalysis' => ['Resources/*.gguf'] }
  s.frameworks = 'Accelerate', 'Foundation', 'ImageIO'
  s.libraries = 'c++', 'mtmd', 'llama', 'ggml', 'ggml-base', 'ggml-cpu', 'ggml-blas', 'vendor-hash'
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}/Libraries/include"',
    'LIBRARY_SEARCH_PATHS' => '$(inherited) "${PODS_TARGET_SRCROOT}/Libraries/$(PLATFORM_NAME)/lib"'
  }
  s.user_target_xcconfig = {
    'LIBRARY_SEARCH_PATHS' => '$(inherited) "${PODS_ROOT}/../../modules/chroma-analysis/ios/Libraries/$(PLATFORM_NAME)/lib"'
  }
end
