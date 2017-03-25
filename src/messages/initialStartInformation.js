/**
 * Copyright 2017-present, Callstack.
 * All rights reserved.
 *
 * initialStartInformation.js
 *
 * @flow
 */
const dedent = require('dedent');
const chalk = require('chalk');
const path = require('path');

type Params = {
  webpackConfig: {
    entry: Array<string>,
  },
  port: number,
};

const getEntryFile = (entries: Array<string>) => {
  return path.resolve(process.cwd(), entries[entries.length - 1]);
};

module.exports = (config: Params) => dedent`
  Ready at ${chalk.cyan(`http://localhost:${config.port}`)}
   
  Webpack is now bundling your React Native app, starting from:

    ${chalk.grey(getEntryFile(config.webpackConfig.entry))}

  Note that fresh start may take longer than usually.
`;
