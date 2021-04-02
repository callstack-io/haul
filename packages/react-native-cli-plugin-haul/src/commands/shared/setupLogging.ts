import { Logger, Runtime } from '@haul-bundler/core';

export default function setupLogging(
  argv: {
    verbose?: boolean;
    outputFile?: string;
    json?: boolean;
  },
  runtime: Runtime
) {
  if (argv.verbose) {
    runtime.logger.minLoggingLevel = Logger.Level.Debug;
  }

  if (argv.outputFile && typeof argv.outputFile === 'string') {
    runtime.logger.enableFileLogging(argv.outputFile, {
      json: Boolean(argv.json),
    });
  }
}
