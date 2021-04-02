import webpack from 'webpack';
import { Runtime } from '@haul-bundler/core';
import { Command, Config } from '@react-native-community/cli';

import * as messages from '../messages/bundleMessages';
import { getBoolFromString } from './shared/parsers';
import globalOptions from './shared/globalOptions';
import setupLogging from './shared/setupLogging';
import prepareWebpackConfig from './shared/prepareWebpackConfig';

type Options = {
  assetsDest?: string;
  bundleOutput?: string;
  config?: string;
  dev: boolean;
  json?: boolean;
  maxWorkers?: number;
  minify?: boolean;
  outputFile?: string;
  platform: string;
  progress?: string;
  sourcemapOutput?: string;
  verbose?: boolean;
};

async function bundle(
  _argv: string[],
  _ctx: Config,
  args: Record<string, any>
) {
  const {
    assetsDest,
    bundleOutput,
    config,
    dev,
    json,
    maxWorkers,
    minify,
    outputFile,
    platform,
    progress,
    sourcemapOutput,
    verbose,
  } = args as Options;

  const runtime = new Runtime();
  setupLogging({ verbose, json, outputFile }, runtime);

  try {
    process.env.HAUL_PLATFORM = platform;

    const webpackConfig = prepareWebpackConfig(runtime, {
      config,
      dev,
      minify: minify === undefined ? !dev : minify,
      platform,
      assetsDest,
      bundleOutput,
      sourcemapOutput,
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
      bundleType: 'basic-bundle',
      bundleMode: 'single-bundle',
      maxWorkers,
    });
    messages.initialInformation(runtime, { config: webpackConfig });

    messages.initialBundleInformation(runtime, {
      entry: webpackConfig.entry,
      dev,
    });

    const compiler = webpack(webpackConfig);
    const stats = await new Promise<webpack.Stats>((resolve, reject) =>
      compiler.run((err, info) => {
        if (err || info.hasErrors()) {
          messages.buildFailed(runtime);
          reject(
            err ? err : info.toJson({ errorDetails: true }).errors.join('\n')
          );
        } else {
          resolve(info);
        }
      })
    );

    messages.bundleBuilt(runtime, {
      stats,
      platform,
      assetsPath: webpackConfig.output!.path,
      bundlePath: webpackConfig.output!.filename as string,
    });
    runtime.complete();
  } catch (error) {
    runtime.logger.error(error);
    runtime.unhandledError(error);
    runtime.complete(1);
  }
}

const command: Command = {
  name: 'haul-bundle',
  description:
    'Builds the app bundle for packaging. Run with `--platform` flag to specify the platform [ios|android].',
  func: bundle,
  options: [
    {
      name: '--platform <ios|android>',
      description: 'Platform to bundle for',
    },
    {
      name: '--dev [bool]',
      description: 'Whether to build in development mode',
      default: 'true',
      parse: getBoolFromString,
    },
    {
      name: '--entry-file [string]',
      description:
        'Path to the root JS file, either absolute or relative to JS root',
    },
    {
      name: '--minify [bool]',
      description:
        'Allows overriding whether bundle is minified. This defaults to false if dev is true, and true if dev is false. Disabling minification can be useful for speeding up production builds for testing purposes.',
      parse: getBoolFromString,
    },
    {
      name: '--bundle-output [string]',
      description:
        'File name where to store the resulting bundle, ex. /tmp/groups.bundle.',
    },
    {
      name: '--assets-dest [string]',
      description:
        'Directory name where to store assets referenced in the bundle.',
    },
    {
      name: '--sourcemap-output [string]',
      description: 'File name where to store generated source map',
    },
    {
      name: '--config [path]',
      description: 'Path to the CLI configuration file',
      default: 'haul.config.js',
    },
    {
      name: '--progress [string]',
      description:
        'Display bundle compilation progress with different verbosity levels. Note that logging the compilation progress will increase build time. Defaults to `none` when you are building in production mode. Choices: ["none", "minimal", "compact", "expanded", "verbose"].',
    },
    {
      name: '--max-workers [int]',
      description: 'Number of workers used to load modules',
      parse: parseInt,
      default: '1',
    },
    ...globalOptions,
  ],
};

export default command;
