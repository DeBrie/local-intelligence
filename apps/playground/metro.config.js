const { withNxMetro } = require('@nx/react-native');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '../..');

const customConfig = {
  cacheVersion: '@debrie-workspace/playground',
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg'],
    // Ensure all libs use the same React instance from the app
    extraNodeModules: {
      react: path.resolve(workspaceRoot, 'node_modules/react'),
      'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
    },
  },
};

module.exports = withNxMetro(mergeConfig(defaultConfig, customConfig), {
  // Change this to true to see debugging info.
  // Useful if you have issues resolving modules
  debug: false,
  // all the file extensions used for imports other than 'ts', 'tsx', 'js', 'jsx', 'json'
  extensions: [],
  // Specify folders to watch, in addition to Nx defaults (workspace libraries and node_modules)
  watchFolders: [
    require('path').resolve(__dirname, '../../libs/core'),
    require('path').resolve(__dirname, '../../libs/pii'),
    require('path').resolve(__dirname, '../../libs/sentiment'),
    require('path').resolve(__dirname, '../../libs/semantic-search'),
  ],
});
