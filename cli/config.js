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

const { assign, create, defineProperty } = Object;
const configurable = true;
const __directory = toDirectory(import.meta.url);
const { has } = Reflect;
const { max } = Math;
const { parse: parseJSON } = JSON;
const writable = true;

// =============================================================================
// Runtime Mode: Is It Production?

const isProduction = runDevelopTask => {
  if (runDevelopTask) {
    if (process.env.NODE_ENV === 'production') {
      process.env.NODE_ENV = undefined;
    }
    return false;
  }

  return process.env.NODE_ENV === 'production';
};

// =============================================================================
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

// =============================================================================
// Option Types as well as Tasks

const tasks = ['htaccess', 'develop', 'build', 'validate', 'deploy'];
const validateTask = (name, report) => {
  if (tasks.includes(name)) return name;
  return report(`is not a valid task name`);
};

// When adding option and type, consider adding default value towards EOF.
const optionTypes = aliased(
  assign(defaults(), {
    buildDir: FilePath,
    cleanRun: Boolean,
    componentDir: FilePath,
    contentDir: FilePath,
    copyright: String,
    deploymentDir: String,
    doNotBuild: FileGlob,
    doNotValidate: FileGlob,
    dryRun: Boolean,
    json: Boolean,
    pageProvider: FilePath,
    staticAssets: FileGlob,
    tlsCertificate: FilePath,
    trailingSlash: Boolean,
    versionAssets: Boolean,
    _: validateTask,
  })
);

const enableTasks = options => {
  if (options._) options._.forEach(task => task && (options[task] = true));
};

// =============================================================================
// Determine Configuration

export const configure = async () => {
  // Load manifests for website and tool.
  const forgeManifest = await loadForgeManifest();
  const forge = create(null);
  forge.name = 'site:forge';
  forge.version = forgeManifest.version;

  const siteManifest = await loadSiteManifest();
  const site = create(null);
  site.name = siteManifest.name || 'website';
  site.version = siteManifest.version || new Date().toISOString();

  // ---------------------------------------------------------------------------
  // CLI: Parse arguments.
  const argv = process.argv.slice(2);
  const cli = optionsFromArguments(argv, optionTypes);
  enableTasks(cli);

  // CLI: Second-guess user by turning only -v (verbose) into -V (version)
  if (argv.length === 1) {
    const [arg] = argv;
    if (arg === '-v' || arg === '-hv' || arg === '-vh') {
      cli.verbose = 0;
      cli.version = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Manifest: Parse options.
  const pkg = optionsFromObject(
    siteManifest['site:forge'] || siteManifest.siteforge || create(null),
    optionTypes
  );
  enableTasks(pkg);

  // ---------------------------------------------------------------------------
  // Merge Options.

  // Determine final volume: Give precedence to CLI & account for DEBUG.
  const debug = (process.env.DEBUG || '').split(',').some(c => {
    const component = c.trim();
    return component === 'site:forge' || component === 'siteforge';
  });

  let volume;
  if (has(cli, 'verbose') || has(cli, 'quiet')) {
    volume = max(cli.volume, debug ? 3 : cli.volume);
  } else {
    volume = max(pkg.volume, debug ? 3 : pkg.volume);
  }

  const production = isProduction(cli.develop || pkg.develop);
  const optionDefaults = {
    buildDir: resolve(production ? './build/prod' : './build/dev'),
    componentDir: resolve('./components'),
    contentDir: resolve('./content'),
    doNotBuild: () => false,
    doNotValidate: () => false,
    pageProvider: 'layout/page.js',
    staticAssets: glob('**/asset/**', '**/assets/**', '**/static/**'),
    tlsCertificate: resolve('./config/localhost'),
  };

  const options = { ...optionDefaults, ...pkg, ...cli, volume };

  let hasTask = false;
  for (const task of tasks) {
    if (options[task]) {
      hasTask = true;
      break;
    }
  }
  if (!hasTask) options.help = true;

  // ---------------------------------------------------------------------------
  // Et voila!
  return {
    site,
    forge,
    production,
    options,
  };
};

// =============================================================================
// Validate Configuration

export const validate = config => {
  const { logger, options, production } = config;

  if (options.develop && (production || options.validate || options.deploy)) {
    if (production) {
      logger.error(
        `The develop task cannot run in production mode; please clear NODE_ENV`
      );
    }
    if (options.validate || options.deploy) {
      logger.error(`The develop task is incompatible with validate and deploy`);
    }

    process.exitCode = 78; // EX_CONFIG
    options.help = true;
  }

  if (options.deploy && (!production || !options.deploymentDir)) {
    if (!production) {
      logger.error(
        `The deploy task only runs in production mode; please set NODE_ENV`
      );
    }
    if (!options.deploymentDir) {
      logger.error(`The deploy task requires valid "deployment-dir" option`);
    }

    process.exitCode = 78; // EX_CONFIG
    options.help = true;
  }

  return config;
};
