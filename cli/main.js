#!/usr/bin/env node --title=site:forge

// © 2020-2021 Robert Grimm

import { buildAll, rebuildOnDemand } from '@grr/builder';
import { configure, validate } from './config.js';
import createContext from '@grr/builder/context';
import { createDevServer } from '@grr/http';
import { join, resolve } from 'path';
import { Kind } from '@grr/inventory/kind';
import { networkInterfaces } from 'os';
import open from 'open';
import process from 'process';
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
  `Attribute “media” not allowed on element “meta” at this point.`,
  `.*Cannot invoke "org.w3c.css.values.CssValue.get(Raw)?Type\\(\\)" because "this.val1" is null.`,
  `CSS: “backdrop-filter”: Property “backdrop-filter” doesn't exist.`,
  `CSS: “background-image”: “0%” is not a “color” value.`,
  `CSS: “color-adjust”: Property “color-adjust” doesn't exist.`,
  `“font-size”`,
  `CSS: “font-size”: The types are incompatible.`,
  `CSS: “font-stretch”: “\\d{1,3}\\%” is not a “font-stretch” value.`,
  `CSS: “inset”: Property “inset” doesn't exist.`,
  `CSS: Parse Error.`,
  `CSS: Unknown pseudo-element or pseudo-class “:is”`,
  `File was not checked. Files must have \\.html, \\.xhtml, \\.htm, or \\.xht extensions.`,
  `Possible misuse of “aria-label”`,
  `The “contentinfo” role is unnecessary for element “footer”.`,
];
const { keys: keysOf } = Object;

// -----------------------------------------------------------------------------
// Inventory of File System

async function takeInventory(config) {
  const { executor, inventory, logger } = config;

  await walk(config.options.contentDir, {
    ignoreNoEnt: true,
    isExcluded: config.options.doNotBuild,
    onFile: (_, source, path) => {
      const { kind } = inventory.add(path, { source });
      logger.info(`Added ${kind} "${path}" to inventory`);
    },
    run: (...args) => executor.submit(...args),
  }).done;
}

// -----------------------------------------------------------------------------
// Validation

function validateMarkup(config) {
  const { inventory, logger, options } = config;
  const { justCopy } = options;

  // Nu Validator's command line interface pretends to be useful but is not.
  // Anything beyond selecting all files of a given type is impossible. That
  // means traversing the file system before traversing the file system. Yay!
  const paths = [];
  for (const file of inventory.byKind(Kind.Markup)) {
    if (justCopy(file.path)) continue;
    const path = join(options.buildDir, file.path);
    paths.push(path);
  }

  logger.info(
    `Found ${paths.length} markup file${paths.length !== 1 ? 's' : ''
    } to validate`
  );

  // prettier-ignore
  return run('java', [
    '-jar', vnuPath,
    '--skip-non-html',
    '--errors-only', // VNU ignores filter pattern on "possible misuse of aria-label".
    '--filterpattern', `(${IGNORED_VALIDATIONS.join('|')})`,
    ...(options.volume >= 2 ? ['--verbose'] : []),
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

  if (config.options.dryRun) {
    rsyncOptions.push('--dry-run');
  }

  let { buildDir } = config.options;
  if (!buildDir.endsWith('/')) buildDir += '/';

  return run('rsync', [
    ...rsyncOptions,
    buildDir,
    config.options.deploymentHost,
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
    await rm(options.buildDir, { force: true, recursive: true });
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

  if (options.build || options.develop) {
    logger.section(3.2, `Build website in "${options.buildDir}"`, config);
    await buildAll(config);
  }

  if (options.develop) {
    logger.section(3.3, `Serve website in "${options.buildDir}"`, config);

    const { stdout } = await run('ps', ['-o', 'pid,comm'], { stdio: 'buffer' });
    const match = / *(?<pid>\d+) site:forge/.exec(stdout)
    if (match) {
      const pid = Number(match[1]);
      if (pid != process.pid) {
        logger.note(`Killing previously launched site:forge with PID ${pid}`);
        process.kill(pid, 'SIGTERM');
      }
    }

    let eventSource, server, stopBuilding;

    // Shut down Dev Server, notably by stopping to build.
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;

      logger.note(`Shutting down dev server`);
      if (eventSource) eventSource.close();
      const steps = [];
      if (server) steps.push(server.close());
      if (stopBuilding) steps.push(stopBuilding());
      await Promise.all(steps);
    };

    // Try to identify an IP address that's routable on the public internet.
    let ip;
    if (options.routableAddress) {
      const interfaces = networkInterfaces();
      for (const name of keysOf(interfaces)) {
        for (const description of interfaces[name]) {
          if (description.family === 'IPv4' && !description.internal) {
            ip = description.address;
            break;
          }
        }

        if (ip) break;
      }
    }

    // Instantiate Dev Server including SSE middleware.
    try {
      ({ eventSource, server } = await createDevServer({ ...config, ip }));
    } catch (x) {
      logger.error(`Couldn't start dev server`, x);
      return;
    }
    logger.note(`Dev server is running at "${server.origin}"`);

    try {
      await open(server.origin);

      stopBuilding = rebuildOnDemand(config, {
        afterBuild(changes) {
          eventSource.emit({
            event: 'reload',
            data: JSON.stringify({ changes }),
          });
        },
      });
    } catch (x) {
      logger.error(`Couldn't start file system monitor`, x);
      await close();
      return;
    }

    process.on('SIGINT', close);
    process.on('SIGTERM', close);

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
    logger.section(5, `Deploy to "${options.deploymentHost}"`, config);
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

main();
