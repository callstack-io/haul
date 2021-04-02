import { getBoolFromString } from './parsers';

const globalOptions = [
  {
    name: 'output-file [filename]',
    description: 'Log all messages to a file.',
  },
  {
    name: 'json',
    description:
      'When --output-file is set, log each message as a JSON object.',
    parse: getBoolFromString,
  },
  {
    name: 'verbose',
    description: 'Print all logs including debug messages.',
    parse: getBoolFromString,
  },
];

export default globalOptions;
