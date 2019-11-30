/* © 2019 Robert Grimm */

import {
  aliased,
  defaults,
  FileGlob,
  FilePath,
  optionsFromObject,
  optionsFromArguments,
} from './tooling/options.js';

import Error from './tooling/error.js';
import { join, resolve } from 'path';
import Logger from './tooling/logger.js';
import { glob, readFile, toDirectory } from './tooling/fs.js';

const { assign } = Object;
const __directory = toDirectory(import.meta.url);
const { parse: parseJSON } = JSON;

// -----------------------------------------------------------------------------
// Manifest Loading

const loadSiteManifest = async () => {
  const path = join(process.cwd(), 'package.json');
  try {
    return parseJSON(await readFile(path));
  } catch (x) {
    if (x.code === 'ENOENT') return {};
    throw Error(`unable to load website manifest from "${path}"`, x);
  }
};

const loadForgeManifest = async () => {
  const path = join(__directory, '../package.json');
  try {
    return parseJSON(await readFile(path));
  } catch (x) {
    throw Error(`unable to load site:forge manifest from "${path}"`, x);
  }
};

// -----------------------------------------------------------------------------
// Option Types and Defaults

const tasks = ['htaccess', 'build', 'validate', 'deploy'];
const validateTask = (name, report) => {
  if (tasks.includes(name)) return name;
  return report(`is not a valid task name`);
};

const optionTypes = aliased(
  assign(defaults(), {
    asset: FileGlob,
    buildDir: FilePath,
    cleanBuild: Boolean,
    contentDir: FilePath,
    deploymentDir: String,
    doNotBuild: FileGlob,
    doNotValidate: FileGlob,
    dryRun: Boolean,
    realm: String,
    rightsNotice: String,
    _: validateTask,
  })
);

const optionDefaults = {
  asset: glob('**/asset/**', '**/assets/**'),
  buildDir: resolve('./build'),
  contentDir: resolve('./content'),
  doNotBuild: () => false,
  doNotValidate: () => false,
  realm: process.env.NODE_ENV || 'development',
};

// -----------------------------------------------------------------------------
// Determine Configuration

const configure = async () => {
  // Load manifests for website and tool.
  const forgeManifest = await loadForgeManifest();
  const forge = {
    name: 'site:forge',
    version: forgeManifest.version,
  };

  const siteManifest = await loadSiteManifest();
  const site = {
    name: siteManifest.name || 'website',
    version: siteManifest.version || new Date().toISOString(),
  };

  // Ingest command line arguments.
  const argv = process.argv.slice(2);
  const cli = optionsFromArguments(argv, optionTypes);
  if (cli._) cli._.forEach(task => task && (cli[task] = true));

  // CLI Overrides: A couple of heuristics to improve user experience.
  if (argv.length === 1) {
    const [arg] = argv;
    if (arg === '-v' || arg === '-hv' || arg === '-vh') {
      cli.verbose = 0;
      cli.version = 1;
    }
  }

  // Since site:forge already supports a comprehensive volume level, having a
  // separate debug flag seems superfluous.
  const debug = (process.env.DEBUG || '').split(',').some(c => {
    const component = c.trim();
    return component === 'site:forge' || component === 'siteforge';
  });
  if (debug) cli.volume = 3;

  // Validate website manifest.
  const pkg = optionsFromObject(
    siteManifest['site:forge'] || siteManifest.siteforge || {},
    optionTypes
  );

  // Merge options giving priority to CLI arguments over website manifest.
  const options = assign({}, optionDefaults, pkg, cli);

  // Instantiate the default logger.
  const logger = new Logger({ volume: options.volume });

  // Load tool help if necessary.
  const usage = options.help
    ? await readFile(join(__directory, 'usage.txt'), 'utf8')
    : null;

  // Et voila!
  return { site, forge, options, logger, usage };
};

export default configure;
