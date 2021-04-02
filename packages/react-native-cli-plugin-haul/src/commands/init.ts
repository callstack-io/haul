import {
  Runtime,
  getReactNativeVersion,
  DEFAULT_CONFIG_FILENAME,
} from '@haul-bundler/core';
import ora, { Ora } from 'ora';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import dedent from 'dedent';
import which from 'which';
import exec from 'execa';
import npmFetch from 'npm-registry-fetch';
import { Command } from '@react-native-community/cli';

import setupLogging from './shared/setupLogging';

const delay = (time: number) =>
  new Promise(resolve => setTimeout(resolve, time));

async function createHaulProjectConfig(
  progress: Ora,
  cwd: string,
  runtime: Runtime,
  preset: string
) {
  // Does `haul.config.js` already exist?
  let overwrite = true;
  if (fs.existsSync(path.join(cwd, DEFAULT_CONFIG_FILENAME))) {
    overwrite = ((await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `There is already a '${DEFAULT_CONFIG_FILENAME}'. Overwrite it?`,
      },
    ])) as { overwrite: boolean }).overwrite;
  }

  if (!overwrite) {
    return;
  }

  progress.start('Generating config files');

  await delay(1000);

  const config = dedent`
    import { withPolyfills, makeConfig } from "${preset}";

    export default makeConfig({
      bundles: {
        index: {
          entry: withPolyfills('./index'),
        },
      },
    });
  `;

  fs.writeFileSync(path.join(cwd, DEFAULT_CONFIG_FILENAME), config);

  progress.succeed(
    `Generated ${runtime.logger.enhanceWithModifier(
      'bold',
      DEFAULT_CONFIG_FILENAME
    )}`
  );
}

async function modifyBabelConfig(
  progress: Ora,
  cwd: string,
  runtime: Runtime,
  babelPreset: string
) {
  progress.start('Updating Babel config');

  const defaultBabelConfigPaths = [
    path.join(cwd, 'babel.config.js'),
    path.join(cwd, '.babelrc.js'),
    path.join(cwd, '.babelrc'),
  ];

  let babelConfigPath = defaultBabelConfigPaths.find(filePath =>
    fs.existsSync(filePath)
  );

  if (!babelConfigPath) {
    const result = (await inquirer.prompt([
      {
        type: 'input',
        name: 'entry',
        message: 'Enter path to the Babel config file',
        validate: (pathToFile: string) =>
          fs.existsSync(pathToFile) ? true : `${pathToFile} is not a valid`,
      },
    ])) as { entry: string };

    babelConfigPath = path.resolve(result.entry);
  }

  const babelConfig = fs.readFileSync(babelConfigPath).toString();
  fs.writeFileSync(
    babelConfigPath,
    babelConfig.replace('metro-react-native-babel-preset', babelPreset)
  );

  progress.succeed(
    `Updated Babel config at ${runtime.logger.enhanceWithModifier(
      'bold',
      path.relative(cwd, babelConfigPath)
    )}`
  );
}

async function modifyXcodeProject(progress: Ora, cwd: string) {
  let xcodeProject;

  // Does `ios/*.xcodeproj` exist?
  const iosPath = path.join(cwd, 'ios');
  if (fs.existsSync(iosPath)) {
    xcodeProject = fs
      .readdirSync(iosPath)
      .find(file => file.includes('.xcodeproj'));
    xcodeProject = path.join(iosPath, xcodeProject || '');
  }

  // Otherwise, ask for path to a file
  if (!xcodeProject) {
    const result = (await inquirer.prompt([
      {
        type: 'input',
        name: 'entry',
        message: 'Enter path to the .xcodeproj file',
        validate: (pathToFile: string) =>
          fs.existsSync(pathToFile) && pathToFile.includes('.xcodeproj')
            ? true
            : `${pathToFile} is not a valid .xcodeproj`,
      },
    ])) as { entry: string };

    xcodeProject = path.resolve(result.entry);
  }

  progress.start('Adding haul to your Xcode build scripts');

  await delay(1000);

  let project = fs
    .readFileSync(path.join(xcodeProject, 'project.pbxproj'))
    .toString();

  const haulSignature = 'added by Haul';

  /* Make sure we check both project iOS and iOS-TV, that's the magic behind "2" constant */

  const PROJECTS_COUNT = 2;

  const countOccurrences = (search: string) => {
    return project.split(search).length - 1;
  };

  // Are we already integrated?
  if (countOccurrences(haulSignature) === PROJECTS_COUNT) {
    progress.info('Haul is already part of your build scripts');
    return;
  }

  const originalTask = 'shellScript = "export NODE_BINARY=node';

  if (countOccurrences(originalTask) !== PROJECTS_COUNT) {
    progress.warn(
      `Couldn't edit Xcode project. Haven't recognized 'Bundle React Native code and images' build phase.`
    );
    return;
  }

  const haulTask = `shellScript = "# ${haulSignature}\\nexport BUNDLE_COMMAND=haul-bundle\\nexport NODE_BINARY=node`;

  project = project.replace(new RegExp(originalTask, 'g'), haulTask);

  fs.writeFileSync(path.join(xcodeProject, 'project.pbxproj'), project);
  progress.succeed('Added haul to your Xcode build scripts');
}

async function modifyGradleBuild(progress: Ora, cwd: string) {
  let gradleBuildFile;
  // Does `android/app/build.gradle` exist?
  const androidPath = path.join(cwd, 'android/app');
  if (fs.existsSync(androidPath)) {
    gradleBuildFile = fs
      .readdirSync(androidPath)
      .find(file => file.includes('build.gradle'));
    gradleBuildFile = path.join(androidPath, gradleBuildFile || '');
  }
  // Otherwise, ask for path to a file
  if (!gradleBuildFile) {
    const result = (await inquirer.prompt([
      {
        type: 'input',
        name: 'entry',
        message: 'Enter path to the android/app/build.gradle file',
        validate: (pathToFile: string) =>
          fs.existsSync(pathToFile) && pathToFile.includes('build.gradle')
            ? true
            : `${pathToFile} is not a valid build.gradle`,
      },
    ])) as { entry: string };
    gradleBuildFile = path.resolve(result.entry);
  }
  progress.start('Adding haul to your build.gradle');
  await delay(1000);
  let project = fs.readFileSync(gradleBuildFile).toString();

  // Are we already integrated?
  if (project.includes('bundleCommand: "haul-bundle"')) {
    progress.info('Haul is already part of your build.gradle');
    return;
  }

  project = project.replace(
    /project\.ext\.react = \[\n([^\]]+)\n\]/,
    dedent`
    project.ext.react = [
    $1,
        bundleCommand: "haul-bundle"
    ]
    `
  );
  fs.writeFileSync(gradleBuildFile, project);
  progress.succeed('Added haul to your build.gradle');
}

function getRunScript(scriptName: string) {
  return `yarn run ${scriptName}`;
}

async function addHaulScript(progress: Ora, cwd: string): Promise<string> {
  const packageJson = require(path.join(cwd, 'package.json'));
  const scripts = packageJson.scripts || {};
  const haulScript = Object.keys(scripts).find(
    name => scripts[name] === 'haul'
  );

  if (haulScript) {
    progress.info('Haul already exists in your package.json.');
    return haulScript;
  }

  let scriptName = 'start';
  if (scripts.start && scripts.start !== 'react-native start') {
    const result = (await inquirer.prompt([
      {
        type: 'input',
        name: 'scriptName',
        message:
          'Enter the name of the script to add to package.json, e.g. `haul` for `yarn run haul`',
        default: 'haul',
      },
    ])) as { scriptName: string };

    scriptName = result.scriptName;
  }

  packageJson.scripts = Object.assign({}, scripts, {
    [scriptName]: 'react-native haul-start',
  });

  progress.start(`Adding \`${scriptName}\` script to your package.json`);

  await delay(1000);

  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  return scriptName;
}

async function getAvailableHaulPreset(
  progress: Ora,
  targetHaulPreset: string
): Promise<string> {
  // Stop searching on 0.59 - there's no preset below 0.59.
  if (targetHaulPreset.includes('0.59')) {
    return targetHaulPreset;
  }

  try {
    await npmFetch(targetHaulPreset);
    return targetHaulPreset;
  } catch (error) {
    if (error.statusCode === 404) {
      progress.info(
        `${targetHaulPreset} not available. Trying older version...`
      );
      const previousHaulPreset = targetHaulPreset.replace(/-0\.\d+$/, match => {
        const [major, minor] = match.slice(1).split('.');
        return `-${major}.${parseInt(minor, 10) - 1}`;
      });
      return await getAvailableHaulPreset(progress, previousHaulPreset);
    }

    return targetHaulPreset;
  }
}

async function installDependencies(
  progress: Ora,
  { babelPreset, haulPreset }: { babelPreset: string; haulPreset: string }
) {
  progress.info('Installing required devDependencies');

  const useYarn = await new Promise<boolean>(resolve => {
    which('yarn', (_, resolved: string | undefined) => {
      resolve(Boolean(resolved));
    });
  });
  const installArgs = (useYarn
    ? ['add', '-D']
    : ['install', '--save-dev']
  ).concat(babelPreset, haulPreset);
  await exec(useYarn ? 'yarn' : 'npm', installArgs, { stdio: 'inherit' });
}

async function init() {
  const runtime = new Runtime();
  setupLogging({}, runtime);
  let exitCode = 0;
  try {
    const cwd = process.cwd();
    const rnVersion = getReactNativeVersion(cwd);

    if (!rnVersion) {
      runtime.logger.error(
        'Cannot find React Native. Are you in React Native project?'
      );
      runtime.complete(1);
    }

    const progress = ora().start('Detecting Haul preset version...');

    const babelPreset = '@haul-bundler/babel-preset-react-native';
    const haulPreset = await getAvailableHaulPreset(
      progress,
      `@haul-bundler/preset-${rnVersion!.major}.${rnVersion!.minor}`
    );

    progress.info(`Using Haul preset: ${haulPreset}`);

    await createHaulProjectConfig(progress, cwd, runtime, haulPreset);
    await modifyBabelConfig(progress, cwd, runtime, babelPreset);
    await modifyXcodeProject(progress, cwd);
    await modifyGradleBuild(progress, cwd);
    const scriptName = await addHaulScript(progress, cwd);
    await installDependencies(progress, { babelPreset, haulPreset });
    progress.succeed(
      `You can now start Haul by running '${getRunScript(scriptName)}'`
    );
  } catch (error) {
    runtime.logger.error('Command failed with error:', error);
    runtime.unhandledError(error);
    exitCode = 1;
  } finally {
    runtime.complete(exitCode);
  }
}

const command: Command = {
  name: 'haul-init',
  description: 'Generates necessary configuration files',
  func: init,
};

export default command;
