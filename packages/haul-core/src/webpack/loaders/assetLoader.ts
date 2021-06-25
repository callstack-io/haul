import utils from 'loader-utils';
import { imageSize } from 'image-size';
import path from 'path';
import dedent from 'dedent';
import hasha from 'hasha';
import escapeStringRegexp from 'escape-string-regexp';
import Runtime from '../../runtime/Runtime';
import AssetResolver from '../resolvers/AssetResolver';

type Config = {
  platform: string;
  bundle?: boolean;
  root: string;
  outputPath?: string | ((path: string) => string);
  publicPath?: string | ((path: string) => string);
};

const MAX_FILENAME_LENGTH = 120;
let longNameAssetCount = 1;

async function assetLoader(this: any) {
  this.cacheable();

  const callback = this.async();
  const { runtime: _runtime = new Runtime(), ...query } =
    utils.getOptions(this) || {};
  const runtime: Runtime = _runtime;
  const config: Config = {
    platform: 'ios',
    root: process.cwd(),
    ...query,
  };
  const pathSepPattern = new RegExp(`\\${path.sep}`, 'g');
  const filePath: string = this.resourcePath;
  const dirname = path.dirname(filePath);
  // Relative path to root without any ../ due to https://github.com/callstack/haul/issues/474
  // Assets from from outside of root, should still be placed inside bundle output directory.
  // Example:
  //   filePath = monorepo/node_modules/my-module/image.png
  //   dirname  = monorepo/node_modules/my-module
  //   root     = monorepo/packages/my-app/
  //   url      = ../../node_modules/my-module (original)
  // So when we calculate destination for the asset for iOS ('assets' + url + filename),
  // it will end up outside of `assets` directory, so we have to make sure it's:
  //   url      = node_modules/my-module (tweaked)
  const url = path
    .relative(config.root, dirname)
    .replace(new RegExp(`^[\\.\\${path.sep}]+`), '');
  const type = path.extname(filePath).replace(/^\./, '');
  const assets = path.join('assets', config.bundle ? '' : config.platform);
  const suffix = `(@\\d+(\\.\\d+)?x)?(\\.(${config.platform}|native))?\\.${type}$`;
  const filename = path.basename(filePath).replace(new RegExp(suffix), '');
  let normalizedName =
    url.length === 0
      ? filename
      : `${url.replace(pathSepPattern, '_')}_${filename}`;
  if (normalizedName.length > MAX_FILENAME_LENGTH) {
    normalizedName =
      normalizedName.substring(normalizedName.length - MAX_FILENAME_LENGTH) +
      '_' +
      (longNameAssetCount++).toString();
  }
  const longName = `${normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')}.${type}`;

  const result: string[] = await new Promise((resolve, reject) =>
    this.fs.readdir(dirname, (err: Error | null, res: string[]) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    })
  );

  const map = AssetResolver.collect(result, {
    name: filename,
    type,
    platform: config.platform,
  });

  const scales = Object.keys(map)
    .map(s => Number(s.replace(/[^\d.]/g, '')))
    .sort();

  const pairs = await Promise.all(
    Object.keys(map).map(
      (
        scale
      ): Promise<{
        destination: string;
        content: string;
      }> => {
        this.addDependency(path.join(dirname, map[scale].name));

        return new Promise((resolve, reject) =>
          this.fs.readFile(
            path.join(dirname, map[scale].name),
            (err: Error | null, res: any) => {
              runtime.logger.debug(`Asset: ${scale} for ${filePath}`);

              if (err) {
                reject(err);
              } else {
                let dest;

                if (config.bundle && config.platform === 'android') {
                  const testXml = /\.(xml)$/;
                  const testMP4 = /\.(mp4)$/;
                  const testImages = /\.(png|jpg|gif|webp)$/;
                  const testFonts = /\.(ttf|otf|ttc)$/;

                  // found font family
                  if (
                    testXml.test(longName) &&
                    res.indexOf('font-family') !== -1
                  ) {
                    dest = 'font';
                  } else if (testFonts.test(longName)) {
                    // font extensions
                    dest = 'font';
                  } else if (testMP4.test(longName)) {
                    // video files extensions
                    dest = 'raw';
                  } else if (
                    testImages.test(longName) ||
                    testXml.test(longName)
                  ) {
                    // images extensions
                    switch (scale) {
                      case '@0.75x':
                        dest = 'drawable-ldpi';
                        break;
                      case '@1x':
                        dest = 'drawable-mdpi';
                        break;
                      case '@1.5x':
                        dest = 'drawable-hdpi';
                        break;
                      case '@2x':
                        dest = 'drawable-xhdpi';
                        break;
                      case '@3x':
                        dest = 'drawable-xxhdpi';
                        break;
                      case '@4x':
                        dest = 'drawable-xxxhdpi';
                        break;
                      default:
                        throw new Error(
                          `Unknown scale ${scale} for ${filePath}`
                        );
                    }
                  } else {
                    // everything else is going to RAW
                    dest = 'raw';
                  }

                  dest = path.join(dest, longName);
                } else {
                  const name = `${filename}${
                    scale === '@1x' ? '' : scale
                  }.${type}`;
                  dest = path.join(assets, url, name);
                }

                runtime.logger.debug(
                  `Asset: file ${filePath} --> destination: ${dest}`
                );

                resolve({
                  destination: dest,
                  content: res,
                });
              }
            }
          )
        );
      }
    )
  );

  pairs.forEach(item => {
    let dest = item.destination;

    if (config.outputPath) {
      // support functions as outputPath to generate them dynamically
      dest =
        typeof config.outputPath === 'function'
          ? config.outputPath(dest)
          : path.join(config.outputPath, dest);
    }

    this.emitFile(dest, item.content);
  });

  let publicPath = JSON.stringify(
    path.join(assets, url).replace(pathSepPattern, '/')
  );

  if (config.publicPath) {
    // support functions as publicPath to generate them dynamically
    publicPath = JSON.stringify(
      typeof config.publicPath === 'function'
        ? config.publicPath(url)
        : path.join(config.publicPath, url)
    );
  }

  const hashes = pairs.map(item =>
    hasha(item.content, {
      algorithm: 'md5',
    })
  );

  let info: ReturnType<typeof imageSize> | undefined;

  try {
    runtime.logger.debug(`Asset: path ${this.resourcePath}`);

    info = imageSize(this.resourcePath);

    const match = path
      .basename(this.resourcePath)
      .match(new RegExp(`^${escapeStringRegexp(filename)}${suffix}`));

    if (match?.[1]) {
      const scale = Number(match[1].replace(/[^\d.]/g, ''));

      if (typeof scale === 'number' && Number.isFinite(scale)) {
        info.width && (info.width /= scale);
        info.height && (info.height /= scale);
      }
    }
  } catch (e) {
    // Asset is not an image
    runtime.logger.error(`Asset: unable to process ${this.resourcePath}`);
  }

  callback(
    null,
    dedent`
      var AssetRegistry = require('react-native/Libraries/Image/AssetRegistry');
      module.exports = AssetRegistry.registerAsset({
        __packager_asset: true,
        scales: ${JSON.stringify(scales)},
        name: ${JSON.stringify(filename)},
        type: ${JSON.stringify(type)},
        hash: ${JSON.stringify(hashes.join())},
        httpServerLocation: ${publicPath},
        ${
          config.bundle ? '' : `fileSystemLocation: ${JSON.stringify(dirname)},`
        }
        ${info ? `height: ${info.height},` : ''}
        ${info ? `width: ${info.width},` : ''}
      });
      `
  );
}

assetLoader.raw = true;

export default assetLoader;
