import { UserDependencyConfig } from '@react-native-community/cli';
import initCommand from './commands/init';
import bundleCommand from './commands/bundle';
import ramBundleCommand from './commands/ramBundle';
import startCommand from './commands/start';
import multiBundleCommand from './commands/multiBundle';

const pluginConfig: UserDependencyConfig = {
  commands: [
    initCommand,
    bundleCommand,
    ramBundleCommand,
    startCommand,
    multiBundleCommand,
  ],
};

export default pluginConfig;
