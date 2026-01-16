Pod::Spec.new do |s|
  s.name         = "debrie-semantic-search"
  s.version      = "0.1.0"
  s.summary      = "On-device semantic search with vector embeddings for React Native"
  s.homepage     = "https://github.com/debrie/local-intelligence"
  s.license      = "MIT"
  s.author       = { "Debrie" => "dev@debrie.com" }
  s.platforms    = { :ios => "12.0" }
  s.source       = { :git => "https://github.com/debrie/local-intelligence.git", :tag => "#{s.version}" }
  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.dependency "React-Core"
  s.dependency "React-RCTFabric"
  s.dependency "React-Codegen"
  s.dependency "RCT-Folly"
  s.dependency "RCTRequired"
  s.dependency "RCTTypeSafety"
  s.dependency "ReactCommon/turbomodule/core"
end
