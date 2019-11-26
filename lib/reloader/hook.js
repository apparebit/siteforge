/**
 * @module reloader/hook
 * @copyright (C) 2019 Robert Grimm.
 */

import config from './config.js';
import { builtinModules } from 'module';
const { debug, epoch, scopes } = config();

export function resolve(specifier, parentModuleURL, defaultResolver) {
  debug(`resolve(%o, %o)`, specifier, parentModuleURL);

  // Treat builtin modules and bare specifiers as before.
  if (builtinModules.includes(specifier)) {
    return { url: specifier, format: 'builtin' };
  } else if (
    !/^\.{0,2}[/]/u.test(specifier) &&
    !specifier.startsWith('file:')
  ) {
    return defaultResolver(specifier, parentModuleURL);
  }

  // Resolve module specifier to file URL. Then check whether the reloader hook
  // has been enabled for some directory containing the module.
  const resolved = new URL(specifier, parentModuleURL).href;
  if (!scopes.some(scope => resolved.startsWith(scope))) {
    return defaultResolver(resolved, parentModuleURL);
  }

  // Decorate module URL with hash representing module's epoch. That hash
  // is the parent module's hash, if the parent has one. Otherwise, it is
  // the current epoch encoded as a decimal number.
  const hash = parentModuleURL ? new URL(parentModuleURL).hash : '';

  let url;
  if (hash) {
    url = resolved + hash;
    debug(` -> %s with parent's hash`, url);
  } else {
    url = `${resolved}#${epoch.current()}`;
    debug(` -> %s with current epoch`, url);
  }

  return { url, format: 'module' };
}
