/* © 2020 Robert Grimm */

import { pathToFileURL } from 'url';
import { resolve as makeAbsolute } from 'path';

const configurable = true;
const { defineProperty } = Object;
const LOADER_CONFIG = '@grr/siteforge/loader/config';
const LOADER_HOOK = '@grr/siteforge/loader/hook';
const MAGIC = '~'.charCodeAt(0);

let didSignal = false;
const signal = reason => {
  didSignal = true;
  throw new Error(reason);
};

// -----------------------------------------------------------------------------

let config;
const loaderConfig = () => {
  if (didSignal) return null;
  if (config == null) config = global[LOADER_CONFIG];
  if (
    config == null ||
    typeof config !== 'object' ||
    typeof config.root !== 'string'
  ) {
    signal(
      "invalid configuration for module loader hook in `global['" +
        LOADER_CONFIG +
        "']`"
    );
  }
  return config;
};

// -----------------------------------------------------------------------------

export function resolve(specifier, context, builtinResolve) {
  if (!didSignal && specifier.charCodeAt(0) === MAGIC) {
    const { root } = loaderConfig();
    if (root) {
      return {
        url: pathToFileURL(makeAbsolute(root, specifier.slice(1))),
      };
    }
  }

  return builtinResolve(specifier, context, builtinResolve);
}

defineProperty(global, LOADER_HOOK, {
  configurable,
  value: true,
});
