const glob = require('glob');
const execa = require('execa');
const path = require('path');

const CWD = path.join(__dirname, '..');

const packages = glob.sync('packages/*/tsconfig.json', {
  cwd: CWD,
});

try {
  execa.sync('yarn', ['tsc', '-b', ...packages, ...process.argv.slice(2)], {
    cwd: CWD,
    stdio: 'inherit',
  });
} catch (error) {
  console.log(error);
}
// execa.sync('yarn', ['tsc', '-b', ...packages, ...process.argv.slice(2)], {
//   cwd: CWD,
//   stdio: 'inherit',
// });
