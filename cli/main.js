#!/usr/bin/env node --title=site:forge

// © 2020-2021 Robert Grimm

import { buildAll, rebuildOnDemand } from '@grr/builder';
import { configure, validate } from './config.js';
import createContext from '@grr/builder/context';
import { createDevServer } from '@grr/http';
import { join, resolve } from 'path';
import { Kind } from '@grr/inventory/kind';
import launch from '@grr/loader/launch';
import open from 'open';
import { readFile, rm, toDirectory } from '@grr/fs';
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
  `CSS: “line-height”: Cannot invoke "org.w3c.css.values.CssValue.getType\\(\\)" because "this.val1" is null.`,
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
  const { inventory, logger, options } = config;
  const { doNotValidate } = options;

  // Nu Validator's command line interface pretends to be useful but is not.
  // Anything beyond selecting all files of a given type is impossible. That
  // means traversing the file system before traversing the file system. Yay!
  const paths = [];
  for (const { target } of inventory.byKind(Kind.Markup)) {
    if (doNotValidate(target)) continue;
    paths.push(target);
  }

  logger.info(
    `Found ${paths.length} markup file${
      paths.length !== 1 ? 's' : ''
    } to validate`
  );

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

async function main() {
  // ---------------------------------------------------------------------------
  // Determine Configuration and Create Logger.

  const config = validate(await createContext(configure));
  const { logger, options } = config;

  // ---------------------------------------------------------------------------
  // Handle Display of Version and Help

  if (options.version) {
    logger.note(`site:forge ${config.forge.version}`);
  }
  if (options.help) {
    const help = await readFile(join(__directory, 'usage.txt'), 'utf8');
    logger.println(logger.embellish(help));
  }
  if (options.version || options.help) {
    return;
  }

  // ---------------------------------------------------------------------------
  // Clean Previous Build

  if (
    (options.develop || options.build) &&
    options.cleanRun &&
    !options.dryRun
  ) {
    logger.section(1, `Clean previous build in "${options.buildDir}"`, config);
    await rm(options.buildDir, { recursive: true });
  }

  // ---------------------------------------------------------------------------
  // Scan File System for In-Memory Inventory

  if (
    options.htaccess ||
    options.develop ||
    options.build ||
    options.validate
  ) {
    logger.section(2, `Create inventory of "${options.contentDir}"`, config);
    try {
      await takeInventory(config);
    } catch (x) {
      logger.error(`Unable to scan file system:`, x);
      process.exitCode = 74; // EX_IOERR
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Build .htaccess

  if (options.htaccess && !options.dryRun) {
    logger.section(3.1, `Build ".htaccess"`, config);
    try {
      await run('bash', [BUILD_HTACCESS], { cwd: options.contentDir });
    } catch (x) {
      logger.error(x);
    }
  }

  // ---------------------------------------------------------------------------
  // Build and Serve Content

  if (options.develop || options.build) {
    logger.section(3.2, `Build website in "${options.buildDir}"`, config);
    await buildAll(config);
  }

  if (options.develop) {
    logger.section(3.3, `Serve website in "${options.buildDir}"`, config);

    let server, stopBuilding;
    try {
      const { eventSource, server } = createDevServer(config);
      logger.note(`Dev server is running at "${server.origin}"`);
      await open(server.origin);

      stopBuilding = rebuildOnDemand(config, {
        afterBuild(changes) {
          eventSource.emit({ data: JSON.stringify(changes) });
        },
      });
    } catch (x) {
      logger.error(x);
      if (server) await server.close();
      if (stopBuilding) await stopBuilding();
    }

    // Skip the rest of main():
    //  * Validate and deploy are disabled b/c incompatible.
    //  * Printing summary statistics mid-run is confusing.
    return;
  }

  // ---------------------------------------------------------------------------
  // Validate Markup

  if (options.validate && logger.errors) {
    logger.warning(`Build has errors, skipping validation`);
  } else if (options.validate && !options.dryRun) {
    logger.section(4, `Validate markup in "${options.buildDir}"`, config);

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
    logger.section(5, `Deploy to "${options.deploymentDir}"`, config);
    await deploy(config);
  }

  // ---------------------------------------------------------------------------
  // Summarize Run

  if (options.dryRun) {
    logger.note(
      `Since option "dry-run" was enabled, no changes were persisted.`
    );
  }

  logger.done({
    files: config.inventory?.size || 0,
    duration: config.stopMainTimer().get(),
  });
}

launch({ fn: main });
