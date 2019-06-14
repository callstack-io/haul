import Boom from '@hapi/boom';
import Hapi from '@hapi/hapi';
import Joi from '@hapi/joi';
// @ts-ignore
import Compiler from '@haul-bundler/core-legacy/build/compiler/Compiler';
import runAdbReverse from '../utils/runAdbReverse';
import createDeltaBundle from './createDeltaBundle';
import Runtime from '../runtime/Runtime';

export default function setupCompilerRoutes(
  runtime: Runtime,
  server: Hapi.Server,
  compiler: any,
  { port }: { port: number }
) {
  let hasRunAdbReverse = false;
  let hasWarnedDelta = false;
  const bundleRegex = /^([^.]+)(\.[^.]+)?\.(bundle|delta)$/;

  server.route({
    method: 'GET',
    path: '/{any*}',
    options: {
      validate: {
        query: {
          platform: Joi.string(),
          minify: Joi.boolean(),
          dev: Joi.boolean(),
        },
      },
    },
    handler: async (request, h) => {
      if (!bundleRegex.test(request.path)) {
        return new Promise(resolve => {
          const filename = request.path;
          compiler.emit(Compiler.Events.REQUEST_FILE, {
            filename,
            callback: (result: {
              file?: any;
              errors: string[];
              mimeType: string;
            }) => {
              resolve(makeResponseFromCompilerResults(h, filename, '', result));
            },
          });
        });
      } else {
        let [, bundleName, platform, bundleType] = bundleRegex.exec(
          request.path
        ) || ['', '', '', ''];
        if (platform) {
          platform = platform.slice(1);
        } else {
          platform = request.query.platform as string;
        }

        if (!hasRunAdbReverse && platform === 'android') {
          await runAdbReverse(runtime, port);
          hasRunAdbReverse = true;
        }

        if (bundleType === 'delta' && !hasWarnedDelta) {
          runtime.logger.warn(
            'Your app requested a delta bundle, this has minimal support in Haul'
          );
          hasWarnedDelta = true;
        }

        return new Promise(resolve => {
          const filename = `${bundleName}.${platform}.bundle`;
          compiler.emit(Compiler.Events.REQUEST_BUNDLE, {
            filename,
            platform,
            callback: (result: {
              file?: any;
              errors: string[];
              mimeType: string;
            }) => {
              resolve(
                makeResponseFromCompilerResults(h, filename, bundleType, result)
              );
            },
          });
        });
      }
    },
  });
}

function makeResponseFromCompilerResults(
  h: Hapi.ResponseToolkit,
  filename: string,
  bundleType: string,
  result: {
    file?: any;
    errors: string[];
    mimeType: string;
  }
) {
  if (result.errors) {
    return Boom.badImplementation(`File ${filename} not found`);
  } else if (!result.file) {
    return Boom.notFound(`File ${filename} not found`);
  }

  let file;
  if (bundleType === 'delta') {
    // We have a bundle, but RN is expecting a delta bundle.
    // Convert full bundle into the simplest delta possible.
    // This will load slower in RN, but it won't error, which is
    // nice for automated use-cases where changing the dev setting
    // is not possible.
    file = createDeltaBundle(result.file.toString());
  } else {
    file =
      result.file.type === 'Buffer'
        ? Buffer.from(result.file.data)
        : result.file;
  }

  return h
    .response(file.toString())
    .type(result.mimeType)
    .code(200);
}
