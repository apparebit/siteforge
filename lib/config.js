/**
 * @module tooling/info
 * @copyright (C) 2019 Robert Grimm
 */

import { createGlobMatcher, directory } from './tooling/fs.js';
import getopt from './tooling/getopt.js';
import { join, resolve } from 'path';
import Logger from './tooling/logger.js';
import { readFileSync } from 'fs';

const { assign } = Object;
const moduleDir = directory(import.meta.url);
const { parse: parseJSON } = JSON;

const { sitePkg, forgePkg } = (function dependencies() {
  const siteDir = join(process.cwd(), 'package.json');
  const sitePkg = parseJSON(readFileSync(siteDir, 'utf8'));
  const forgeDir = join(moduleDir, '../package.json');
  const forgePkg = parseJSON(readFileSync(forgeDir, 'utf8'));
  return { sitePkg, forgePkg };
})();

/** The tool name. */
export const toolName = 'site:forge';

/** The tool version. */
export const toolVersion = forgePkg.version;

/** The website name. */
export const siteName = sitePkg.name || 'website';

/** Flag for whether tool is being debugged. */
export const toolIsBeingDebugged = (process.env.DEBUG || '')
  .split(',')
  .some(m => m.trim() === toolName);

/**
 * The options object, which combines command line arguments, information from
 * the website's manifest, and tool defaults. Site-forge prints supported
 * command line options when the `-h` or `--help` option is specified. Each
 * documented option can also be configured in the website's `package.json`
 * manifest file under the `site:forge` key. For example, to configure the
 * rights notice, you can either specify
 *
 *     --rights-notice "Public Domain"
 *
 * as command line arguments or add the
 *
 *     "rightsNotice": "Public Domain"
 *
 * property to the manifest. Please use camelCase notation when specifying JSON
 * properties since the dashed representation is only recognized for command
 * line arguments.
 */
export const options = (function setUpOptions() {
  // Parse command line options
  const validTasks = ['htaccess', 'build', 'validate', 'deploy'];
  const argv = process.argv.slice(2);

  const opts = getopt(
    argv,
    assign(getopt.defaults(), {
      contentDir: String,
      buildDir: String,
      cleanBuild: Boolean,
      doNotBuild: String,
      rightsNotice: String,

      doNotValidate: String,

      dryDeploy: Boolean,
      deploymentDir: String,

      _: (arg, reportError) => {
        if (validTasks.includes(arg)) return arg;
        return reportError(
          `command line argument "${arg}" is not a valid task name`
        );
      },
    })
  );
  opts._.forEach(task => task && (opts[task] = true));

  // Merge with manifest options and defaults.
  const pkg = sitePkg[toolName] || sitePkg.siteforge || {};
  opts.volume = opts.volume || pkg.volume;

  opts.contentDir = resolve(opts.contentDir || pkg.contentDir || './content/');
  opts.buildDir = resolve(opts.buildDir || pkg.buildDir || './build/');
  opts.cleanBuild = opts.cleanBuild || pkg.cleanBuild;
  opts.rightsNotice = opts.rightsNotice || pkg.rightsNotice;
  let doNot = opts.doNotBuild || pkg.doNotBuild;
  opts.doNotBuild = doNot ? createGlobMatcher(doNot) : () => false;

  doNot = opts.doNotValidate || pkg.doNotValidate;
  opts.doNotValidate = doNot ? createGlobMatcher(doNot) : () => false;

  opts.dryDeploy = opts.dryDeploy || pkg.dryDeploy;
  opts.deploymentDir = opts.deploymentDir || pkg.deploymentDir;

  // Don't aggravate users needlessly:
  //   * If the only argument is "-v", "-vh", or "-hv", treat "-v" as "-V".
  if (
    argv.length === 1 &&
    (argv[0] === '-v' || argv[0] === '-vh' || argv[0] === '-hv')
  ) {
    opts.verbose = 0;
    opts.version = 1;
  }

  return opts;
})();

// The help text.
export const usage = readFileSync(join(moduleDir, 'usage.txt'), 'utf8');

/** The main logger. */
export const logger = new Logger({ volume: options.volume });
