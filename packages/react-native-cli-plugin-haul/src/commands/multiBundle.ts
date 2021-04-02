import webpack from 'webpack';
import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import cpx from 'cpx';
import {
  Runtime,
  getProjectConfigPath,
  getNormalizedProjectConfigBuilder,
  sortBundlesByDependencies,
  getBundleFilename,
  EnvOptions,
} from '@haul-bundler/core';
import SimpleProgressWebpackPlugin from 'simple-progress-webpack-plugin';
import { Command, Config } from '@react-native-community/cli';

import { getBoolFromString } from './shared/parsers';
import globalOptions from './shared/globalOptions';
import setupLogging from './shared/setupLogging';
import * as messages from '../messages/multiBundleMessages';

interface Options {
  assetsDest?: string;
  bundleOutput?: string;
  config?: string;
  dev: boolean;
  maxWorkers?: number;
  minify?: boolean;
  platform: string;
  progress: string;
  skipHostCheck?: boolean;
  sourcemapOutput?: string;
  verbose?: boolean;
}

async function multiBundle(_argv: string[], _ctx: Config, args: Options) {
  const runtime = new Runtime();
  setupLogging(args, runtime);
  try {
    const {
      config,
      dev,
      minify,
      platform,
      assetsDest,
      bundleOutput,
      sourcemapOutput,
      progress,
      skipHostCheck,
      maxWorkers,
    } = args;
    process.env.HAUL_PLATFORM = platform;

    const directory = process.cwd();
    const configPath = getProjectConfigPath(directory, config);
    const normalizedProjectConfigBuilder = getNormalizedProjectConfigBuilder(
      runtime,
      configPath
    );
    const env: EnvOptions = {
      platform,
      root: directory,
      dev,
      bundleMode: 'multi-bundle',
      bundleTarget: 'file',
      bundleOutput,
      assetsDest,
      sourcemapOutput,
      minify: minify === undefined ? !dev : minify,
      maxWorkers,
    };
    const optionsWithProgress = {
      ...env,
      progress:
        progress !== undefined
          ? progress
          : !dev
          ? 'none'
          : // Ensure that we don't trip Xcode's error detection. 'verbose' is the
          // only level that doesn't make Xcode think that the bundle failed.
          !process.stdin.isTTY
          ? 'verbose'
          : 'compact',
    };
    const projectConfig = normalizedProjectConfigBuilder(
      runtime,
      optionsWithProgress
    );

    for (const bundleName of sortBundlesByDependencies(projectConfig, {
      skipHostCheck,
    })) {
      const bundleConfig = projectConfig.bundles[bundleName];
      if (bundleConfig.external) {
        runtime.logger.info(
          `Using external${bundleConfig.dll ? ' DLL' : ''} bundle`,
          runtime.logger.enhanceWithModifier('bold', bundleName)
        );
        runtime.logger.info(
          'Bundle path',
          runtime.logger.enhanceWithColor(
            'gray',
            bundleConfig.external.bundlePath
          )
        );
        if (bundleConfig.dll) {
          runtime.logger.info(
            'Manifest path',
            runtime.logger.enhanceWithColor(
              'gray',
              bundleConfig.external.manifestPath
            )
          );
        }

        if (bundleConfig.external.copyBundle) {
          const filename = getBundleFilename(
            env,
            projectConfig.templates,
            projectConfig.bundles[bundleName]
          );
          // `bundleOutput` should be a directory, but for backward-compatibility,
          // we also handle the case with a filename.
          let bundleOutputDirectory = bundleConfig.root;
          if (env.bundleOutput) {
            bundleOutputDirectory =
              path.extname(env.bundleOutput) === ''
                ? env.bundleOutput
                : path.dirname(env.bundleOutput);
            bundleOutputDirectory = path.isAbsolute(bundleOutputDirectory)
              ? bundleOutputDirectory
              : path.join(bundleConfig.root, bundleOutputDirectory);
          }
          mkdirp.sync(bundleOutputDirectory);
          runtime.logger.info(
            'Copying bundle to',
            runtime.logger.enhanceWithColor(
              'gray',
              path.join(bundleOutputDirectory, filename)
            )
          );
          fs.copyFileSync(
            bundleConfig.external.bundlePath,
            path.join(bundleOutputDirectory, filename)
          );
          if (fs.existsSync(`${bundleConfig.external.bundlePath}.map`)) {
            fs.copyFileSync(
              `${bundleConfig.external.bundlePath}.map`,
              path.join(bundleOutputDirectory, `${filename}.map`)
            );
            runtime.logger.info(
              'Copying bundle source maps to',
              runtime.logger.enhanceWithColor(
                'gray',
                path.join(bundleOutputDirectory, `${filename}.map`)
              )
            );
          }

          let assetsOutputDirectory = bundleConfig.root;
          if (env.assetsDest) {
            assetsOutputDirectory = env.assetsDest;
          } else if (env.bundleOutput) {
            assetsOutputDirectory = env.bundleOutput;
          }
          assetsOutputDirectory = path.isAbsolute(assetsOutputDirectory)
            ? assetsOutputDirectory
            : path.join(bundleConfig.root, assetsOutputDirectory);

          cpx.copySync(
            path.join(
              bundleConfig.external.assetsPath,
              '**/*.{aac,aiff,bmp,caf,gif,html,jpeg,jpg,m4a,m4v,mov,mp3,mp4,mpeg,mpg,obj,otf,pdf,png,psd,svg,ttf,wav,webm,webp}'
            ),
            assetsOutputDirectory,
            {
              preserve: true,
            }
          );
        }
        continue;
      }

      try {
        const webpackConfig = projectConfig.webpackConfigs[bundleName];

        // Attach progress plugin
        if (progress !== 'none') {
          webpackConfig.plugins!.push(
            new SimpleProgressWebpackPlugin({
              format: progress,
            }) as webpack.Plugin
          );
        }

        messages.initialBundleInformation(runtime, {
          bundleName,
          webpackConfig,
        });
        const stats = await build(webpackConfig);
        runtime.logger.print('');
        messages.bundleBuilt(runtime, { stats });
      } catch (error) {
        runtime.logger.error(`${bundleName} bundle compilation failed`);
        throw error;
      }
    }

    runtime.logger.done(
      'All bundles successfully compiled. You can now run your React Native multi-bundle app.'
    );
    runtime.complete();
  } catch (error) {
    runtime.logger.error(error);
    runtime.unhandledError(error);
    runtime.complete(1);
  }
}

function build(webpackConfig: webpack.Configuration) {
  const compiler = webpack(webpackConfig);
  return new Promise<webpack.Stats>((resolve, reject) =>
    compiler.run((err, info) => {
      if (err || info.hasErrors()) {
        reject(
          err
            ? err
            : new Error(info.toJson({ errorDetails: true }).errors.join('\n'))
        );
      } else {
        resolve(info);
      }
    })
  );
}

const command: Command = {
  name: 'haul-multi-bundle',
  description: 'Create multiple bundles to be used in multi-bundle mode',
  // @ts-ignore
  func: multiBundle,
  options: [
    {
      name: '--platform <ios|android>',
      description: 'Platform to bundle for',
      // experimental
      // @ts-ignore
      // required: true,
    },
    {
      name: '--dev <bool>',
      description: 'Whether to build in development mode',
      default: 'true',
      parse: getBoolFromString,
    },
    {
      name: '--minify <bool>',
      description:
        'Allows overriding whether bundle is minified. This defaults to false if dev is true, and true if dev is false. Disabling minification can be useful for speeding up production builds for testing purposes.',
      parse: getBoolFromString,
    },
    {
      name: '--bundle-output <string>',
      description:
        'File name where to store the resulting bundle, ex. /tmp/groups.bundle.',
    },
    {
      name: '--assets-dest <string>',
      description:
        'Directory name where to store assets referenced in the bundle.',
    },
    {
      name: '--sourcemap-output <string>',
      description: 'File name where to store generated source map',
    },
    {
      name: '--config [path]',
      description: 'Path to the CLI configuration file',
      default: 'haul.config.js',
    },
    {
      name: '--progress <string>',
      description:
        'Display bundle compilation progress with different verbosity levels. Note that logging the compilation progress will increase build time. Defaults to `none` when you are building in production mode. Choices: ["none", "minimal", "compact", "expanded", "verbose"].',
    },
    {
      name: '--max-workers [int]',
      description: 'Number of workers used to load modules',
      parse: parseInt,
      default: '1',
    },
    {
      name: '--skip-host-check [bool]',
      description: 'Skips check for "index" or "host" bundle in Haul config',
      parse: getBoolFromString,
      default: 'false',
    },
    ...globalOptions,
  ],
};

export default command;
