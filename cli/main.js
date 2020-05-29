#!/usr/bin/env node --title=site:forge

// © 2020 Robert Grimm

import configure from './config.js';
import createContext from '@grr/builder/context';
import { readFile, rmdir, toDirectory } from '@grr/fs';
import { EOL } from 'os';
import { join, resolve } from 'path';
import { Kind } from '@grr/inventory/kind';
import launch from '@grr/loader/launch';
import { buildAll } from '@grr/builder';
import run from '@grr/run';
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

function validate(config) {
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

  const config = await createContext(configure);

  // ---------------------------------------------------------------------------
  // Handle Display of Version and Help

  if (config.options.version) {
    config.logger.notice(`site:forge ${config.forge.version}${EOL}`);
  }
  if (config.options.help) {
    const help = await readFile(join(__directory, 'usage.txt'), 'utf8');
    config.logger.println(config.logger.embolden(help));
  }
  if (config.options.version || config.options.help) {
    return;
  }

  // ---------------------------------------------------------------------------
  // Clean Previous Build

  if (
    (config.options.htaccess || config.options.build) &&
    config.options.cleanRun &&
    !config.options.dryRun
  ) {
    task(config, `Clean previous build in "${config.options.buildDir}"`);
    await rmdir(config.options.buildDir, { recursive: true });
  }

  // ---------------------------------------------------------------------------
  // Build File System Inventory

  if (
    config.options.htaccess ||
    config.options.build ||
    config.options.validate
  ) {
    task(config, `Create inventory of "${config.options.contentDir}"`);
    try {
      await takeInventory(config);
    } catch (x) {
      config.logger.error(`Unable to read file system hierarchy:`, x);
      process.exitCode = 74; // EX_IOERR
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Build .htaccess

  if (config.options.htaccess && !config.options.dryRun) {
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
    await buildAll(config);
  }

  // ---------------------------------------------------------------------------
  // Validate Markup

  if (config.options.validate && config.logger.errors) {
    config.logger.warning(`Build has errors, skipping validation`);
  } else if (config.options.validate && !config.options.dryRun) {
    task(config, `Validate markup in "${config.options.buildDir}"`);

    try {
      await validate(config);
    } catch (x) {
      config.logger.error(`Markup did not validate`, x);
      process.exitCode = 65; // EX_DATAERR
    }
  }

  // ---------------------------------------------------------------------------
  // Deploy Generated Website

  if (config.options.deploy && config.logger.errors) {
    config.logger.warning(`Build has errors, skipping deployment`);
  } else if (config.options.deploy) {
    if (!config.options.deploymentDir) {
      config.logger.error(
        `option "deployment-dir" must be defined to deploy website`
      );
      process.exitCode = 78; // EX_CONFIG
    }

    task(config, `Deploy to "${config.options.deploymentDir}"`);
    await deploy(config);
  }

  // ---------------------------------------------------------------------------
  // Summarize Run

  if (config.options.dryRun) {
    config.logger.notice(
      `Since option "dry-run" was enabled, no changes were persisted.`
    );
  }

  config.logger.signOff({
    files: (config.inventory && config.inventory.size) || 0,
    duration: config.stopMainTimer().get(),
  });
}

launch({ fn: main });
