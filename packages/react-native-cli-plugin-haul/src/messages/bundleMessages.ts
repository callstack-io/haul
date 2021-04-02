import { Runtime, parseEntry } from '@haul-bundler/core';
import webpack from 'webpack';
import path from 'path';

export function initialInformation(
  runtime: Runtime,
  { config }: { config: webpack.Configuration }
) {
  runtime.logger.info(
    `Assets Destination: ${runtime.logger.enhanceWithColor(
      'gray',
      config.output!.path
    )}`
  );
  runtime.logger.info(
    `Bundle output: ${runtime.logger.enhanceWithColor(
      'gray',
      config.output!.filename
    )}`
  );
  runtime.logger.info(
    `Bundle output (resolved): ${runtime.logger.enhanceWithColor(
      'gray',
      path.resolve(config.output!.filename! as string)
    )}`
  );
}

export function initialBundleInformation(
  runtime: Runtime,
  { entry, dev }: { entry: webpack.Configuration['entry']; dev: boolean }
) {
  const mode = dev ? 'development' : 'production';
  runtime.logger.info(
    `Haul is now bundling your React Native app in ${runtime.logger.enhanceWithModifier(
      'bold',
      mode
    )} mode`
  );
  runtime.logger.info(
    `Starting from:\n${runtime.logger.enhanceWithColor(
      'gray',
      parseEntry(entry)
    )}`
  );
}

export function buildFailed(runtime: Runtime) {
  runtime.logger.error('Failed to compile.');
}

function getBuildTime(stats: webpack.Stats) {
  const jsonStats = stats.toJson({ timings: true });
  return jsonStats.time
    ? jsonStats.time
    : Math.max(...jsonStats.children!.map(({ time }: any) => time));
}

export function bundleBuilt(
  runtime: Runtime,
  args: {
    stats: webpack.Stats;
    platform: string;
    assetsPath?: string;
    bundlePath?: string;
  }
) {
  const warnings = args.stats.toJson({ warnings: true }).warnings;
  if (args.stats.hasWarnings()) {
    runtime.logger.warn(
      `Built with warnings in ${(getBuildTime(args.stats) / 1000).toFixed(2)}s!`
    );
    runtime.logger.warn(warnings.join('\n'));
  } else {
    runtime.logger.done(
      `Built successfully in ${(getBuildTime(args.stats) / 1000).toFixed(2)}s!`
    );
  }

  if (args.assetsPath && args.bundlePath) {
    runtime.logger.info(
      `Assets location: ${runtime.logger.enhanceWithColor(
        'gray',
        args.assetsPath
      )}`
    );
    runtime.logger.info(
      `Bundle location: ${runtime.logger.enhanceWithColor(
        'gray',
        path.join(args.assetsPath, args.bundlePath)
      )}`
    );
  }

  const device =
    args.platform === 'all' ? 'your device' : `your ${args.platform} device`;
  runtime.logger.done(`You can now run the app on ${device}`);
}
