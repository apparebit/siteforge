#!/usr/bin/env node
// © 2020 Robert Grimm

import minify from 'babel-minify';
import configure from './config.js';
import { copyFile, rmdir, toDirectory } from '@grr/fs';
import cssnano from 'cssnano';
import { EOL } from 'os';
import Executor from '@grr/async';
import Inventory from '@grr/inventory';
import postcss from 'postcss';
import { resolve } from 'path';
import run from '@grr/run';
import vnuPath from 'vnu-jar';
import walk from '@grr/walk';

const BUILD_HTACCESS = resolve(
  toDirectory(import.meta.url),
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
// File System Inventory

async function inventorize(executor, config) {
  const inventory = new Inventory();

  await walk(config.options.contentDir, {
    ignoreNoEnt: true,
    isExcluded: config.options.doNotBuild,
    onFile: (_, source, path) => inventory.addFile(path, { source }),
    run: (...args) => executor.submit(...args),
  }).done;

  return inventory;
}

// -----------------------------------------------------------------------------
// Shared Resources

async function copyAsset(path, file, config) {
  config.logger.info(`Copying resource "${path}"`);
  const built = file.under(config.options.buildDir);
  await copyFile(file.source, built);
}

// -----------------------------------------------------------------------------
// Scripts

async function buildScript(path, file, config) {
  config.logger.info(`Compressing script "${path}"`);
  const built = file.under(config.options.buildDir);

  await file.read();
  await file.processWithCopyright(
    content => minify(content, {}, { comments: false }).code
  );
  await file.write(built, {
    versioned: config.options.versionAssets && path !== '/sw.js',
  });
}

// -----------------------------------------------------------------------------
// Styles

const css = postcss([
  cssnano({
    preset: [
      'default',
      {
        svgo: false,
      },
    ],
  }),
]);

function reportPostCSSWarning(logger, warn) {
  let msg = '';
  if (warn.node && warn.node.type !== 'root') {
    msg += `${warn.node.source.start.line}:${warn.node.source.start.column}: `;
  }
  msg += warn.text;
  if (warn.plugin) {
    msg += ` [${warn.plugin}]`;
  }
  logger.warning(msg);
}

async function buildStyle(path, file, config) {
  config.logger.info(`Compressing style "${path}"`);
  const built = file.under(config.options.buildDir);

  await file.read();
  await file.processWithCopyright(async content => {
    const minified = await css.process(content, {
      from: file.source,
      to: built,
    });
    minified
      .warnings()
      .forEach(warn => reportPostCSSWarning(config.logger, warn));
    return minified.css;
  });
  await file.write(built, { versioned: config.options.versionAssets });
}

// -----------------------------------------------------------------------------
// Pages

async function buildPage(path, file, config) {
  config.logger.info(`Building page "${path}"`);
  const built = file.under(config.options.buildDir);

  await file.read();
  await file.write(built);
}

// -----------------------------------------------------------------------------
// Work Scheduling

async function build(inventory, executor, config) {
  // for (const [path, file] of inventory.byKind('data')) {
  //   executor.call(loadData, path, file, config);
  // }

  // await executor.onIdle;

  for (const [path, file] of inventory.byKind('etc', 'font', 'image')) {
    executor.run(copyAsset, undefined, path, file, config);
  }
  for (const [path, file] of inventory.byKind('style')) {
    executor.run(buildStyle, undefined, path, file, config);
  }
  for (const [path, file] of inventory.byKind('script')) {
    executor.run(buildScript, undefined, path, file, config);
  }
  await executor.onIdle();

  for (const [path, file] of inventory.byKind('markup')) {
    executor.run(buildPage, undefined, path, file, config);
  }
  await executor.onIdle();
}

// -----------------------------------------------------------------------------
// Validation

function validate(inventory, config) {
  // Nu Validator's command line interface pretends to be useful but is not.
  // Anything beyond selecting all files of a given type is impossible. That
  // means traversing the file system before traversing the file system. Yay!
  const paths = [];
  for (const [, file] of inventory.byKind('markup')) {
    const output = file.under(config.options.buildDir);
    if (!config.options.doNotValidate(output)) paths.push(output);
  }

  // prettier-ignore
  return run('java', [
      '-jar', vnuPath,
      '--skip-non-html',
      '--filterpattern', IGNORED_VALIDATIONS.join('|'),
      ...(this.options.volume >= 2 ? ['--verbose'] : []),
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

  return run('rsync', [
    ...rsyncOptions,
    config.options.buildDir,
    config.options.deploymentDir,
  ]);
}

// -----------------------------------------------------------------------------

let taskNo = 1;
function task(config, description) {
  config.logger.notice(`site:forge §${taskNo++}. ${description}`);
}

async function main() {
  // >>>>>>>>>> Determine Configuration
  const config = await configure();

  // >>>>>>>>>> Print Version and Help
  if (config.options.version) {
    console.error(`site:forge ${config.forge.version}${EOL}`);
  }
  if (config.options.help) {
    console.error(config.usage);
  }
  if (config.options.version || config.options.help) {
    return;
  }

  // >>>>>>>>>> Clean Previous Build
  if (
    (config.options.htaccess || config.options.build) &&
    config.options.cleanBuild
  ) {
    task(
      config,
      `Clean previous build by removing "${config.options.buildDir}"`
    );
    await rmdir(config.options.buildDir, { recursive: true });
  }

  // >>>>>>>>>> Build File System Inventory
  const executor = new Executor();

  let inventory;
  if (
    config.options.htaccess ||
    config.options.build ||
    config.options.validate
  ) {
    task(config, `Determine work by traversing "${config.options.contentDir}"`);
    try {
      inventory = await inventorize(executor, config);
    } catch (x) {
      config.logger.error(`Unable to read file system hierarchy:`, x);
      process.exitCode = 74; // EX_IOERR
      return;
    }
  }

  // >>>>>>>>>> Build .htaccess
  if (config.options.htaccess) {
    task(config, `Build web server configuration`);
    try {
      await run('bash', [BUILD_HTACCESS], { cwd: config.options.contentDir });
    } catch (x) {
      config.logger.error(x);
    }
  }

  // >>>>>>>>>> Build Content
  if (config.options.build) {
    task(config, `Actually build website`);
    await build(inventory, executor, config);
  }

  // >>>>>>>>>> Validate Markup
  if (config.options.validate) {
    task(
      config,
      `Validate generated markup files in "${config.options.buildDir}"`
    );

    try {
      await validate(inventory, config);
    } catch (x) {
      config.logger.error(`Markup did not validate`, x);
      process.exitCode = 65; // EX_DATAERR
      return;
    }
  }

  // >>>>>>>>>> Deploy Generated Website
  if (config.options.deploy) {
    if (!config.options.deploymentDir) {
      config.logger.error(
        `option "deployment-dir" must be defined to deploy website`
      );
      process.exitCode = 78; // EX_CONFIG
      return;
    }

    task(
      config,
      `Deploy generated website to "${config.options.deploymentDir}"`
    );
    await deploy(config);
  }

  // >>>>>>>>>> Summarize Run
  task(config, 'Done');
  config.logger.signOff();
}

main();
