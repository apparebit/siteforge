// © 2020 Robert Grimm

import configure from './config.js';
import { readFile, rmdir, toDirectory } from '@grr/fs';
import { EOL } from 'os';
import Executor from '@grr/async';
import Inventory from '@grr/inventory';
import { KIND } from '@grr/inventory/path';
import Logger from '@grr/logger';
import { join, resolve } from 'path';
import run from '@grr/run';
import selectBuilderFor from '@grr/contentforge';
import vnuPath from 'vnu-jar';
import walk from '@grr/walk';

const __directory = toDirectory(import.meta.url);
const BUILD_HTACCESS = resolve(
  __directory,
  '../../server-configs-apache/bin/build.sh'
);

const IGNORED_VALIDATIONS = [
  `CSS: “backdrop-filter”: Property “backdrop-filter” doesn't exist.`,
  `CSS: “background-image”: “0%” is not a “color” value.`,
  `CSS: “color-adjust”: Property “color-adjust” doesn't exist.`,
  `File was not checked. Files must have .html, .xhtml, .htm, or .xht extensions.`,
  `The “contentinfo” role is unnecessary for element “footer”.`,
];

const LOADER_CONFIG = '@grr/siteforge/loader/config';
const LOADER_HOOK = '@grr/siteforge/loader/hook';

// -----------------------------------------------------------------------------
// Inventory of File System

async function takeInventory(executor, config) {
  const inventory = new Inventory({
    isStaticAsset: config.options.staticAssets,
  });

  await walk(config.options.contentDir, {
    ignoreNoEnt: true,
    isExcluded: config.options.doNotBuild,
    onFile: (_, source, path) => {
      const { kind } = inventory.add(path, { source });
      config.logger.info(`Adding ${kind} "${path}" to inventory`);
    },
    run: (...args) => executor.submit(...args),
  }).done;

  return inventory;
}

// -----------------------------------------------------------------------------
// Build

async function build(executor, config) {
  for (const phase of [1, 2, 3]) {
    for (const file of config.inventory.byPhase(phase)) {
      const builder = selectBuilderFor(file.kind);
      if (builder) {
        executor.run(builder, undefined, file, config).catch(reason => {
          config.logger.error(`Failed to build "${file.path}"`, reason);
        });
      } else {
        config.logger.error(`No builder for ${file.kind} "${file.path}"`);
      }
    }

    // We effectively implement a poor man's version of structured concurrency:
    // All tasks spawned in an iteration of the outer loop are joined again by
    // the following await.
    await executor.onIdle();
  }
}

// -----------------------------------------------------------------------------
// Validation

function validate(config) {
  // Nu Validator's command line interface pretends to be useful but is not.
  // Anything beyond selecting all files of a given type is impossible. That
  // means traversing the file system before traversing the file system. Yay!
  const paths = [];
  for (const { target } of config.inventory.byKind(KIND.MARKUP)) {
    if (!config.options.doNotValidate(target)) paths.push(target);
  }

  // prettier-ignore
  return run('java', [
      '-jar', vnuPath,
      '--skip-non-html',
      '--filterpattern', IGNORED_VALIDATIONS.join('|'),
      ...(config.options.volume >= 2 ? ['--verbose'] : []),
      ...paths,
    ]);
}

// -----------------------------------------------------------------------------
// Deployment

// rsync <options> source target
//     NB Source path must end with slash to sync contents, not directory.
//
// -c, --checksum           use checksum not file size + modification time
// -e, --rsh=COMMAND        remote shell
// -n, --dry-run            dry run
// -r, --recursive          recursively
// -u, --update             skip destination files with newer timestamp
// -v, --verbose            verbose
//     --exclude=PATTERN    exclude from source
//     --delete             delete from destination

function deploy(config) {
  // prettier-ignore
  const rsyncOptions = [
    '-cruv',
    '-e', 'ssh -p 2222',
    '--exclude', 'cgi-bin',
    '--exclude', '.well-known',
    '--exclude', '.DS_Store',
    '--exclude', '.git',
    '--delete',
  ];

  if (config.options.dryRun) rsyncOptions.push('--dry-run');

  let build = config.options.buildDir;
  if (!build.endsWith('/')) build = `${build}/`;

  return run('rsync', [...rsyncOptions, build, config.options.deploymentDir]);
}

// =============================================================================

let taskNo = 1;
function task(config, description) {
  config.logger.notice(`site:forge §${taskNo++}: ${description}`);
}

async function main() {
  // ---------------------------------------------------------------------------
  // Determine Configuration and Create Logger.

  const start = process.hrtime.bigint();
  let config;

  try {
    config = await configure();

    config.logger = new Logger({
      inJSON: config.options.logJson,
      volume: config.options.volume,
    });
  } catch (x) {
    config = { options: { help: true }, logger: new Logger() };
    config.logger.error(x.message);
    config.logger.newline();
  }

  // ---------------------------------------------------------------------------
  // Handle Display of Version and Help

  if (config.options.version) {
    config.logger.notice(`site:forge ${config.forge.version}${EOL}`);
  }
  if (config.options.help) {
    const help = await readFile(join(__directory, 'usage.txt'), 'utf8');
    config.logger.notice(config.logger.embolden(help));
  }
  if (config.options.version || config.options.help) {
    return;
  }

  // ---------------------------------------------------------------------------
  // Validate Presence of Module Loader Hook and Configure Hook

  if (global[LOADER_HOOK] === true) {
    config.logger.info(`@grr/siteforge's module loader hook is installed`);

    global[LOADER_CONFIG] = {
      __proto__: null,
      root: config.options.inputDir,
    };
  } else {
    config.logger.error(`@grr/siteforge's module loader hook is missing`);
    return;
  }

  // ---------------------------------------------------------------------------
  // Clean Previous Build

  if (
    (config.options.htaccess || config.options.build) &&
    config.options.cleanBuild
  ) {
    task(config, `Clean previous build in "${config.options.buildDir}"`);
    await rmdir(config.options.buildDir, { recursive: true });
  }

  // ---------------------------------------------------------------------------
  // Build File System Inventory

  const executor = new Executor();

  if (
    config.options.htaccess ||
    config.options.build ||
    config.options.validate
  ) {
    task(config, `Create inventory of "${config.options.contentDir}"`);
    try {
      config.inventory = await takeInventory(executor, config);
    } catch (x) {
      config.logger.error(`Unable to read file system hierarchy:`, x);
      process.exitCode = 74; // EX_IOERR
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Build .htaccess

  if (config.options.htaccess) {
    task(config, `Build ".htaccess"`);
    try {
      await run('bash', [BUILD_HTACCESS], { cwd: config.options.contentDir });
    } catch (x) {
      config.logger.error(x);
    }
  }

  // ---------------------------------------------------------------------------
  // Build Content

  if (config.options.build) {
    task(config, `Generate build in "${config.options.buildDir}"`);
    await build(executor, config);
  }

  // ---------------------------------------------------------------------------
  // Validate Markup

  if (config.options.validate) {
    task(config, `Validate markup in "${config.options.buildDir}"`);

    try {
      await validate(config);
    } catch (x) {
      config.logger.error(`Markup did not validate`, x);
      process.exitCode = 65; // EX_DATAERR
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Deploy Generated Website

  if (config.options.deploy) {
    if (!config.options.deploymentDir) {
      config.logger.error(
        `option "deployment-dir" must be defined to deploy website`
      );
      process.exitCode = 78; // EX_CONFIG
      return;
    }

    task(config, `Deploy to "${config.options.deploymentDir}"`);
    await deploy(config);
  }

  // ---------------------------------------------------------------------------
  // Summarize Run
  const { stats } = config;
  stats.duration = process.hrtime.bigint() - start;
  config.logger.signOff(stats);
}

main();
