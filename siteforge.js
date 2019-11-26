/**
 * @module siteforge
 * @copyright (C) 2019 Robert Grimm
 */

import build from './lib/task/build.js';
import buildHTAccess from './lib/task/build-htaccess.js';
import deploy from './lib/task/deploy.js';
import { EOL } from 'os';
import {
  logger,
  options,
  toolName,
  toolVersion,
  siteName,
  usage,
} from './lib/config.js';
import { rmdir } from './lib/tooling/fs.js';
import validateMarkup from './lib/task/validate-markup.js';

async function task(flag, description, work) {
  if (!flag) return;
  logger.notice(description);
  try {
    await work();
  } catch (x) {
    logger.error(`Task failed`, x);
  }
}

(async function main() {
  // ------------------------- Version and Usage -------------------------
  if (options.version) console.error(`${toolName} ${toolVersion}${EOL}`);
  if (options.help) console.error(usage);
  if (options.version || options.help) return;

  // ------------------------------ Build ------------------------------
  await task(
    options.htaccess || options.build,
    `Building ${siteName}`,
    async () => {
      if (options.htaccess) {
        await buildHTAccess();
      }
      if (options.build) {
        if (options.cleanBuild) {
          await rmdir(options.buildDir, { recursive: true });
        }
        await build();
      }
    }
  );

  // ------------------------------ Validate ------------------------------
  await task(options.validate, `Validating ${siteName}`, async () => {
    try {
      await validateMarkup();
    } catch (x) {
      logger.error(`Markup did not validate`, x);
      process.exit(65); // EX_DATAERR
    }
  });

  // ------------------------------ Deploy ------------------------------
  await task(options.deploy, `Deploying ${siteName}`, async () => {
    if (!options.deploymentDir) {
      logger.error(`Option "--deployment-dir" is not defined`);
      process.exit(78); // EX_CONFIG
    }
    await deploy();
  });

  // ------------------------------ Done ------------------------------
  logger.signOff();
})();
