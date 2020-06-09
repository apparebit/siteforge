#!/usr/bin/env node --title=site:forge

// © 2020 Robert Grimm

import { buildAll } from '@grr/builder';
import { configure, validate } from './config.js';
import createContext from '@grr/builder/context';
import { EOL } from 'os';
import { join, resolve } from 'path';
import { Kind } from '@grr/inventory/kind';
import launch from '@grr/loader/launch';
import { readFile, rmdir, toDirectory } from '@grr/fs';
import run from '@grr/run';
import serve from './serve.js';
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

// -----------------------------------------------------------------------------
// Inventory of File System

async function takeInventory(config) {
  const { executor, inventory, logger } = config;

  await walk(config.options.contentDir, {
    ignoreNoEnt: true,
    isExcluded: config.options.doNotBuild,
    onFile: (_, source, path) => {
      const { kind } = inventory.add(path, { source });
      logger.info(`Adding ${kind} "${path}" to inventory`);
    },
    run: (...args) => executor.submit(...args),
  }).done;
}

// -----------------------------------------------------------------------------
// Validation

function validateMarkup(config) {
  // Nu Validator's command line interface pretends to be useful but is not.
  // Anything beyond selecting all files of a given type is impossible. That
  // means traversing the file system before traversing the file system. Yay!
  const paths = [];
  for (const { target } of config.inventory.byKind(Kind.MARKUP)) {
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

  let { buildDir } = config.options;
  if (!buildDir.endsWith('/')) buildDir += '/';

  return run('rsync', [
    ...rsyncOptions,
    buildDir,
    config.options.deploymentDir,
  ]);
}

// =============================================================================

let taskNo = 1;
function task(config, description) {
  config.logger.notice(`§${taskNo++} ${description}`);
}

async function main() {
  // ---------------------------------------------------------------------------
  // Determine Configuration and Create Logger.

  const config = validate(await createContext(configure));
  const { logger, options } = config;

  // ---------------------------------------------------------------------------
  // Handle Display of Version and Help

  if (options.version) {
    logger.notice(`site:forge ${config.forge.version}${EOL}`);
  }
  if (options.help) {
    const help = await readFile(join(__directory, 'usage.txt'), 'utf8');
    logger.println(logger.embolden(help));
  }
  if (options.version || options.help) {
    return;
  }

  // ---------------------------------------------------------------------------
  // Clean Previous Build

  if ((options.build || options.serve) && options.cleanRun && !options.dryRun) {
    task(config, `Clean previous build in "${options.buildDir}"`);
    await rmdir(options.buildDir, { recursive: true });
  }

  // ---------------------------------------------------------------------------
  // Scan File System for In-Memory Inventory

  if (options.htaccess || options.build || options.serve || options.validate) {
    task(config, `Create inventory of "${options.contentDir}"`);
    try {
      await takeInventory(config);
    } catch (x) {
      logger.error(`Unable to read file system:`, x);
      process.exitCode = 74; // EX_IOERR
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Build .htaccess

  if (options.htaccess && !options.dryRun) {
    task(config, `Build ".htaccess"`);
    try {
      await run('bash', [BUILD_HTACCESS], { cwd: options.contentDir });
    } catch (x) {
      logger.error(x);
    }
  }

  // ---------------------------------------------------------------------------
  // Build and Serve Content

  if (options.build) {
    task(config, `Build website in "${options.buildDir}"`);
    await buildAll(config);
  }

  if (options.serve) {
    task(config, `Serve website in "${options.buildDir}"`);
    await serve(config);
  }

  // ---------------------------------------------------------------------------
  // Validate Markup

  if (options.validate && logger.errors) {
    logger.warning(`Build has errors, skipping validation`);
  } else if (options.validate && !options.dryRun) {
    task(config, `Validate markup in "${options.buildDir}"`);

    try {
      await validateMarkup(config);
    } catch (x) {
      logger.error(`Markup did not validate`, x);
      process.exitCode = 65; // EX_DATAERR
    }
  }

  // ---------------------------------------------------------------------------
  // Deploy Generated Website

  if (options.deploy && logger.errors) {
    logger.warning(`Build has errors, skipping deployment`);
  } else if (options.deploy) {
    task(config, `Deploy to "${options.deploymentDir}"`);
    await deploy(config);
  }

  // ---------------------------------------------------------------------------
  // Summarize Run

  if (options.dryRun) {
    logger.notice(
      `Since option "dry-run" was enabled, no changes were persisted.`
    );
  }

  logger.signOff({
    files: (config.inventory && config.inventory.size) || 0,
    duration: config.stopMainTimer().get(),
  });
}

launch({ fn: main });
