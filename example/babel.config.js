// Copyright 2020-present Evan Bacon. All rights reserved.
// This is a babel config that will alias the package name to the development package.
// Doing this enables easy copy/paste of the project files for random users.

const pkg = require('../package.json');
const { resolve } = require('path');

module.exports = function(api) {
  api.cache(true);
  const isWebpack = api.caller(isTargetWeb);

  let alias = {
    // Alias the package name to its main field.
    [pkg.name]: resolve('..', pkg.main),
    // 'react': resolve('../node_modules/react'),
    // 'react-dom': resolve('../node_modules/react-dom'),
  };

  if (isWebpack) {
    alias['react'] = resolve('../node_modules/react');
    alias['react-dom'] = resolve('../node_modules/react-dom');
  }

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'babel-plugin-module-resolver',
        {
          alias,
        },
      ],
    ],
  };
};

function isTargetWeb(caller) {
  return caller && caller.name === 'babel-loader';
}
