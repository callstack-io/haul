/**
 * Copyright 2017-present, Callstack.
 * All rights reserved.
 *
 * @flow
 */

const { runHaulSync } = require('../runHaul');
const path = require('path');
const fs = require('fs');
const { cleanup, run, replaceTestPath } = require('../utils');

const TEST_PROJECT_DIR = path.resolve(
  __dirname,
  '../fixtures/react-native-generated-project',
);

beforeAll(() => {
  run('yarn', TEST_PROJECT_DIR);
});

beforeEach(() => cleanup(path.resolve(TEST_PROJECT_DIR, 'dist')));

test('bundle ios project', () => {
  bundleForPlatform('ios');
});

test('bundle android project', () => {
  bundleForPlatform('android');
});

function bundleForPlatform(platform) {
  const bundlePath = path.resolve(
    TEST_PROJECT_DIR,
    'dist',
    `index.${platform}.bundle`,
  );
  const { stdout } = runHaulSync(TEST_PROJECT_DIR, [
    'bundle',
    '--platform',
    platform,
  ]);
  expect(replaceTestPath(stdout.toString())).toMatchSnapshot();
  expect(fs.existsSync(bundlePath));
}
