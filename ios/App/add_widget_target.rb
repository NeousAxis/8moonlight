require 'xcodeproj'

PROJECT = 'App.xcodeproj'
EXT_NAME = 'MoonWidgetExtension'
EXT_BUNDLE = 'com.cyrilleger.moonlight.MoonWidget'
TEAM = 'BXB662X8PV'

project = Xcodeproj::Project.open(PROJECT)
app_target = project.targets.find { |t| t.name == 'App' }
raise 'App target not found' unless app_target

# Idempotence : si la cible existe déjà, on repart propre.
if (existing = project.targets.find { |t| t.name == EXT_NAME })
  puts "Removing existing target #{EXT_NAME} to recreate cleanly"
  existing.remove_from_project
end

# 1) Nouvelle cible app-extension (iOS 15, Swift)
ext = project.new_target(:app_extension, EXT_NAME, :ios, '15.0', nil, :swift)

# 2) Groupe + fichiers source
group = project.main_group.find_subpath('MoonWidget', true)
group.set_source_tree('SOURCE_ROOT')
group.set_path('MoonWidget')

swift_ref = group.new_reference('MoonWidget.swift')
plist_ref = group.new_reference('Info.plist')   # référencé mais PAS compilé
ext.add_file_references([swift_ref])

# 3) Réglages de build de la cible widget
ext.build_configurations.each do |config|
  bs = config.build_settings
  bs['PRODUCT_BUNDLE_IDENTIFIER'] = EXT_BUNDLE
  bs['PRODUCT_NAME'] = '$(TARGET_NAME)'
  bs['INFOPLIST_FILE'] = 'MoonWidget/Info.plist'
  bs['INFOPLIST_KEY_CFBundleDisplayName'] = 'Moonlight'
  bs['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  bs['SWIFT_VERSION'] = '5.0'
  bs['DEVELOPMENT_TEAM'] = TEAM
  bs['CODE_SIGN_STYLE'] = 'Automatic'
  bs['TARGETED_DEVICE_FAMILY'] = '1'
  bs['MARKETING_VERSION'] = '1.0'
  bs['CURRENT_PROJECT_VERSION'] = '6'
  bs['GENERATE_INFOPLIST_FILE'] = 'NO'
  bs['SKIP_INSTALL'] = 'YES'
  bs['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  bs['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
end

# 4) Embarquer le .appex dans l'app (copy files -> PlugIns) + dépendance
app_target.add_dependency(ext)
embed = app_target.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
build_file = embed.add_file_reference(ext.product_reference)
build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save

puts "OK: target #{EXT_NAME} (#{EXT_BUNDLE}) added."
puts "App dependencies: #{app_target.dependencies.map { |d| d.target.name }.join(', ')}"
puts "Targets now: #{project.targets.map(&:name).join(', ')}"
