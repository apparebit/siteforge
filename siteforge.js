#!/usr/bin/env node

/**
 * @module siteforge
 * @copyright (C) 2019 Robert Grimm
 */

import build from './lib/task/build.js';
import buildHTAccess from './lib/task/build-htaccess.js';
import configure from './lib/config.js';
import deploy from './lib/task/deploy.js';
import { EOL } from 'os';
import { rmdir } from './lib/tooling/fs.js';
import validateMarkup from './lib/task/validate-markup.js';

const { apply } = Reflect;

async function task(flag, logger, description, work) {
  if (!flag) return;
  logger.notice(description);
  try {
    await work();
  } catch (x) {
    logger.error(`Task failed:`, x);
  }
}

(async function main() {
  // ------------------------------ Startup ------------------------------
  const config = await configure();

  if (config.options.version) {
    console.error(`site:forge ${config.forge.version}${EOL}`);
  }
  if (config.options.help) {
    console.error(config.usage);
  }
  if (config.options.version || config.options.help) {
    return;
  }

  // ------------------------------ Build ------------------------------
  await task(
    config.options.htaccess || config.options.build,
    config.logger,
    `Building ${config.site.name}`,
    async () => {
      if (config.options.htaccess) {
        await apply(buildHTAccess, config, []);
      }
      if (config.options.build) {
        if (config.options.cleanBuild) {
          await rmdir(config.options.buildDir, { recursive: true });
        }
        await apply(build, config, []);
      }
    }
  );

  // ------------------------------ Validate ------------------------------
  await task(
    config.options.validate,
    config.logger,
    `Validating ${config.site.name}`,
    async () => {
      try {
        await apply(validateMarkup, config, []);
      } catch (x) {
        config.logger.error(`Markup did not validate:`, x);
        process.exit(65); // EX_DATAERR
      }
    }
  );

  // ------------------------------ Deploy ------------------------------
  await task(
    config.options.deploy,
    config.logger,
    `Deploying ${config.site.name}`,
    async () => {
      if (!config.options.deploymentDir) {
        config.error(`Option "--deployment-dir" is not defined`);
        process.exit(78); // EX_CONFIG
      }
      await apply(deploy, config, []);
    }
  );

  // ------------------------------ Done ------------------------------
  config.logger.signOff();
})();
