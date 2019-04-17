const path = require('path');

module.exports = {
  displayName: 'haul-core-legacy',
  testPathIgnorePatterns: ['fixtures/.*'],
  moduleNameMapper: {
    '^jest/(.*)': path.join(__dirname, '../../jest/$1'),
  },
  testRegex: '/__tests__/.*\\.(test|spec)\\.js?$',
};
