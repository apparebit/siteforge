/* © 2019-2020 Robert Grimm */

import {
  aliased,
  defaults,
  FileGlob,
  FilePath,
  optionsFromObject,
  optionsFromArguments,
} from '@grr/options';

import glob from '@grr/glob';
import { join, resolve } from 'path';
import { readFile, toDirectory } from '@grr/fs';

const { assign, defineProperty } = Object;
const configurable = true;
const __directory = toDirectory(import.meta.url);
const { parse: parseJSON } = JSON;
const writable = true;

// -----------------------------------------------------------------------------
// Manifest Loading

const WrappedError = (message, cause) => {
  const error = new Error(message);
  defineProperty(error, 'cause', { configurable, writable, value: cause });
  return error;
};

const loadSiteManifest = async () => {
  const path = join(process.cwd(), 'package.json');
  try {
    return parseJSON(await readFile(path));
  } catch (x) {
    if (x.code === 'ENOENT') return {};
    throw WrappedError(`unable to load website manifest from "${path}"`, x);
  }
};

const loadForgeManifest = async () => {
  const path = join(__directory, '../package.json');
  try {
    return parseJSON(await readFile(path));
  } catch (x) {
    throw WrappedError(`unable to load site:forge manifest from "${path}"`, x);
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
    buildDir: FilePath,
    cleanBuild: Boolean,
    contentDir: FilePath,
    copyright: String,
    deploymentDir: String,
    doNotBuild: FileGlob,
    doNotValidate: FileGlob,
    dryRun: Boolean,
    includeDir: FilePath,
    logJson: Boolean,
    pageProvider: FilePath,
    realm: String,
    staticAssets: FileGlob,
    versionAssets: Boolean,
    _: validateTask,
  })
);

const optionDefaults = {
  __proto__: null,
  buildDir: resolve('./build'),
  contentDir: resolve('./content'),
  doNotBuild: () => false,
  doNotValidate: () => false,
  includeDir: resolve('./include'),
  pageProvider: 'page.js',
  realm: process.env.NODE_ENV || 'development',
  staticAssets: glob('**/asset/**', '**/assets/**', '**/static/**'),
};

// -----------------------------------------------------------------------------
// Determine Configuration

const configure = async () => {
  // Load manifests for website and tool.
  const forgeManifest = await loadForgeManifest();
  const forge = {
    __proto__: null,
    name: 'site:forge',
    version: forgeManifest.version,
  };

  const siteManifest = await loadSiteManifest();
  const site = {
    __proto__: null,
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
  const options = assign({ __proto__: null }, optionDefaults, pkg, cli);

  // Set up component cache. FIXME: Consider moving into inventory.
  const components = { __proto__: null };

  // Set up statistics object;
  const stats = { __proto__: null, resources: [], duration: 0n };

  // Et voila!
  return { __proto__: null, site, forge, options, components, stats };
};

export default configure;