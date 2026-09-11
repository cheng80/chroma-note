Pod::Spec.new do |s|
  s.name = 'ChromaLineArt'
  s.version = '1.0.0'
  s.summary = 'Local style1 source-RGB line art for Chroma Note'
  s.description = s.summary
  s.author = 'Chroma Note'
  s.homepage = 'https://github.com/carolineec/informative-drawings'
  s.license = { :type => 'Proprietary' }
  s.source = { :path => '.' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreML', 'ImageIO', 'UniformTypeIdentifiers'
  s.source_files = '*.swift'
  s.resource_bundles = { 'ChromaLineArt' => ['Resources/LineArt.mlmodelc'] }
end
