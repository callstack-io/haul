import {
  DEFAULT_CONFIG_FILENAME,
  INTERACTIVE_MODE_DEFAULT,
  getProjectConfigPath,
  getNormalizedProjectConfigBuilder,
  Server,
  Runtime,
} from '@haul-bundler/core';
import { Command, Config } from '@react-native-community/cli';
import inquirer from 'inquirer';
import net from 'net';
import { exec } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

import { getBoolFromString } from './shared/parsers';
import globalOptions from './shared/globalOptions';
import setupLogging from './shared/setupLogging';

/*
 * Check if the port is already in use
 */
function isPortTaken(port: number, host: string): Promise<boolean> {
  return new Promise(resolve => {
    const portTester = net
      .createServer()
      .once('error', () => {
        return resolve(true);
      })
      .once('listening', () => {
        portTester.close();
        resolve(false);
      })
      .listen(port, host);
  });
}

function killProcess(port: number): Promise<boolean> {
  /*
   * Based on platform, decide what service
   * should be used to find process PID
   */
  const serviceToUse =
    process.platform === 'win32'
      ? `netstat -ano | findstr :${port}`
      : `lsof -n -i:${port} | grep LISTEN`;

  return new Promise(resolve => {
    /*
     * Find PID that is listening at given port
     */
    exec(serviceToUse, (error, stdout) => {
      if (error) {
        /*
         * Error happens if no process found at given port
         */
        resolve(false);
        return;
      }
      /*
       * If no error, port is in use
       * And that port is used only by one process
       */
      const PIDInfo = stdout
        .trim()
        .split('\n')[0]
        .split(' ')
        .filter(entry => entry);

      /* macOSX/Linux: PID is placed at index 1
       * Windows: PID is placed at last index
       */
      const index = process.platform === 'win32' ? PIDInfo.length - 1 : 1;

      const PID = PIDInfo[index];

      /*
       * Kill process
       */
      process.kill(parseInt(PID, 10), 'SIGKILL');

      resolve(true);
    });
  });
}

type Options = {
  port?: number;
  config: string;
  dev: boolean;
  eager: string;
  interactive?: boolean;
  json?: boolean;
  maxWorkers?: number;
  minify?: boolean;
  outputFile?: string;
  skipHostCheck: boolean;
  tempDir?: string;
  verbose?: boolean;
};

async function start(_argv: string[], _ctx: Config, args: Record<string, any>) {
  const {
    port,
    config,
    dev,
    eager,
    interactive,
    json,
    maxWorkers,
    minify,
    outputFile,
    skipHostCheck,
    tempDir,
    verbose,
  } = args as Options;

  const runtime = new Runtime();
  setupLogging({ verbose, json, outputFile }, runtime);

  let parsedEager;
  const list = (eager || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  if (list.length === 1 && (list[0] === 'true' || list[0] === 'false')) {
    parsedEager = list[0] === 'true' ? ['ios', 'android'] : [];
  } else {
    parsedEager = list;
  }

  const directory = process.cwd();

  let targetTempDir: string;
  if (tempDir) {
    targetTempDir = path.isAbsolute(tempDir)
      ? tempDir
      : path.join(directory, tempDir);
  } else {
    targetTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haul-start-'));
  }

  const configPath = getProjectConfigPath(directory, config);
  const projectConfig = getNormalizedProjectConfigBuilder(runtime, configPath)(
    runtime,
    {
      platform: '',
      root: directory,
      dev,
      port,
      bundleMode: 'multi-bundle',
      bundleTarget: 'server',
      assetsDest: targetTempDir,
      minify: minify === undefined ? !dev : minify,
      maxWorkers,
    }
  );

  try {
    const isTaken = await isPortTaken(
      projectConfig.server.port,
      projectConfig.server.host
    );
    if (isTaken) {
      if (interactive) {
        const { userChoice } = await inquirer.prompt({
          type: 'list',
          name: 'userChoice',
          message: `Port ${projectConfig.server.port} is already in use. What should we do?`,
          choices: [
            `Kill process using port ${projectConfig.server.port} and start Haul`,
            'Quit',
          ],
        });
        if (userChoice === 'Quit') {
          runtime.complete(0);
        }
        try {
          await killProcess(projectConfig.server.port);
        } catch (e) {
          runtime.logger.error(
            `Could not kill process! Reason: \n ${e.message}`
          );
          runtime.complete(1);
        }
        runtime.logger.info(`Successfully killed processes.`);
      } else {
        runtime.logger.error(
          `Could not spawn process! Reason: Port ${projectConfig.server.port} already in use.`
        );
        runtime.complete(1);
      }
    }

    new Server(runtime, configPath, {
      dev,
      noInteractive: !interactive,
      minify: minify === undefined ? !dev : minify,
      assetsDest: targetTempDir,
      root: directory,
      eager: parsedEager,
      platforms: projectConfig.platforms,
      bundleNames: Object.keys(projectConfig.bundles),
      skipHostCheck: skipHostCheck,
    }).listen(projectConfig.server.host, projectConfig.server.port);
  } catch (error) {
    runtime.logger.error('Command failed with error:', error);
    runtime.unhandledError(error);
    runtime.complete(1);
  }
}
const command: Command = {
  name: 'haul-start',
  description: 'Starts a new webpack server',
  func: start,
  options: [
    {
      name: '--port [number]',
      description: 'Port to run your webpack server',
      parse: parseInt,
      default: '8081',
    },
    {
      name: '--dev [bool]',
      description: 'Whether to build in development mode',
      default: 'true',
      parse: getBoolFromString,
    },
    {
      name: '--interactive [bool]',
      description:
        "If 'false', disables any user prompts and prevents the UI (which requires a TTY session) from being rendered",
      default: INTERACTIVE_MODE_DEFAULT,
      parse: getBoolFromString,
    },
    {
      name: '--minify [bool]',
      description: `Whether to minify the bundle, 'true' by default when dev=false`,
      parse: getBoolFromString,
    },
    {
      name: '--temp-dir [string]',
      description:
        'Path to directory where to store temporary files, eg. /tmp/dist',
    },
    {
      name: '--config [path]',
      description: `Path to config file, eg. ${DEFAULT_CONFIG_FILENAME}`,
      default: DEFAULT_CONFIG_FILENAME,
    },
    {
      name: '--eager [ios,android,...|true]',
      description: `Disable lazy building for platforms (list is separated by ',', for example 'haul bundle --eager ios,android')`,
      default: 'false',
      parse: (val: string) => {
        if (val === 'true') {
          return true;
        }
        return val;
      },
    },
    {
      name: '--skip-host-check [bool]',
      description: 'Skips check for "index" or "host" bundle in Haul config',
      default: 'false',
      parse: getBoolFromString,
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
