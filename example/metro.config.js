/* eslint-env node */
/* eslint-disable import/no-extraneous-dependencies */

const { join, resolve } = require('path');
const { readFileSync } = require('fs');
const blacklist = require('metro-config/src/defaults/blacklist');
const escape = require('escape-string-regexp');

const root = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const modules = [
  '@babel/runtime',
  '@expo/vector-icons',
  ...Object.keys({
    ...pkg.dependencies,
    ...pkg.peerDependencies,
  }),
];

module.exports = {
  projectRoot: __dirname,
  watchFolders: [root],

  resolver: {
    assetExts: ['db', 'mp3', 'ttf', 'obj', 'mtl', 'png', 'jpg'],
    blacklistRE: blacklist([
      new RegExp(`^${escape(join(root, 'node_modules'))}\\/.*$`),
    ]),

    extraNodeModules: modules.reduce((acc, name) => {
      acc[name] = join(__dirname, 'node_modules', name);
      return acc;
    }, {}),
  },

  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};
