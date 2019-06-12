import webpack from 'webpack';
import {
  getProjectConfigPath,
  getNormalizedProjectConfigBuilder,
  Runtime,
  EnvOptions,
} from '@haul-bundler/core';
import SimpleProgressWebpackPlugin from 'simple-progress-webpack-plugin';

export type Options = {
  config?: string;
  dev: boolean;
  minify?: boolean;
  platform: string;
  assetsDest?: string;
  bundleOutput?: string;
  sourcemapOutput?: string;
  progress: string;
  bundleType: EnvOptions['bundleType'];
  singleBundleMode: boolean;
};

export default function prepareWebpackConfig(
  runtime: Runtime,
  options: Options
): webpack.Configuration {
  // TODO: figure out a better way to read and transpile user files on-demand
  require('@haul-bundler/core-legacy/build/babelRegister');

  const directory = process.cwd();
  const configPath = getProjectConfigPath(directory, options.config);
  const normalizedProjectConfigBuilder = getNormalizedProjectConfigBuilder(
    configPath
  );
  const projectConfig = normalizedProjectConfigBuilder(runtime, {
    platform: options.platform,
    root: directory,
    dev: options.dev,
    bundleType: options.bundleType,
    singleBundleMode: options.singleBundleMode,
    assetsDest: options.assetsDest,
    bundleOutput: options.bundleOutput,
    sourcemapOutput: options.sourcemapOutput,
    minify: options.minify === undefined ? !options.dev : options.minify,
    bundle: true,
  });

  const webpackConfig =
    projectConfig.webpackConfigs.index || projectConfig.webpackConfigs.main;

  if (!webpackConfig) {
    throw new Error(
      'Cannot find webpack config `index` nor `main`. Make sure you have bundle config for `index` or `main'
    );
  }

  // Attach progress plugin
  if (options.progress !== 'none') {
    webpackConfig.plugins!.push(new SimpleProgressWebpackPlugin({
      format: options.progress,
    }) as webpack.Plugin);
  }

  return webpackConfig;
}
