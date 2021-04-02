import { Runtime, parseEntry } from '@haul-bundler/core';
import webpack from 'webpack';
import path from 'path';

export function initialBundleInformation(
  runtime: Runtime,
  {
    bundleName,
    webpackConfig,
  }: { bundleName: string; webpackConfig: webpack.Configuration }
) {
  const name = runtime.logger.enhanceWithModifier('bold', bundleName);
  const mode = runtime.logger.enhanceWithModifier('bold', webpackConfig.mode);

  runtime.logger.info(`Haul is now compiling ${name} bundle in ${mode} mode\n`);
  runtime.logger.info(
    `Assets Destination: ${runtime.logger.enhanceWithColor(
      'gray',
      webpackConfig.output!.path
    )}`
  );
  runtime.logger.info(
    `Bundle output: ${runtime.logger.enhanceWithColor(
      'gray',
      webpackConfig.output!.filename
    )}`
  );
  runtime.logger.info(
    `Bundle output (resolved): ${runtime.logger.enhanceWithColor(
      'gray',
      path.join(
        webpackConfig.output!.path!,
        webpackConfig.output!.filename! as string
      )
    )}`
  );
  runtime.logger.info(
    `Starting from:\n${runtime.logger.enhanceWithColor(
      'gray',
      ((parseEntry(webpackConfig.entry!) as unknown) as string)
        .split('\n')
        .map((line: string) => `${' '.repeat(7)}${line}`)
        .join('\n')
    )}`
  );
}

function getBuildTime(stats: webpack.Stats) {
  const jsonStats = stats.toJson({ timings: true });
  return jsonStats.time
    ? jsonStats.time
    : Math.max(...jsonStats.children!.map(({ time }: any) => time));
}

export function bundleBuilt(
  runtime: Runtime,
  {
    stats,
  }: {
    stats: webpack.Stats;
  }
) {
  const warnings = stats.toJson({ warnings: true }).warnings;
  if (stats.hasWarnings()) {
    runtime.logger.warn(
      `Built with warnings in ${(getBuildTime(stats) / 1000).toFixed(2)}s!`
    );
    runtime.logger.warn(warnings.join('\n'));
  } else {
    runtime.logger.done(
      `Built successfully in ${(getBuildTime(stats) / 1000).toFixed(2)}s!`
    );
  }
}
