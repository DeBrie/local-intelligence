require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name            = "debrie-semantic-search"
  s.version         = package["version"]
  s.summary         = package["description"]
  s.description     = package["description"]
  s.homepage        = "https://github.com/debrie/local-intelligence"
  s.license         = package["license"]
  s.platforms       = { :ios => "13.0" }
  s.author          = "Debrie"
  s.source          = { :git => "https://github.com/debrie/local-intelligence.git", :tag => "#{s.version}" }

  s.source_files    = "ios/**/*.{h,m,mm,swift}"

  install_modules_dependencies(s)
end
