/**
 * @module tooling/getopt
 * @copyright (C) 2009 Robert Grimm
 */

import { createGlobMatcher } from './fs.js';
import { EOL } from 'os';
import { resolve } from 'path';

const configurable = true;
const DASH = '-'.charCodeAt(0);
const enumerable = true;
const { has } = Reflect;
const { isArray } = Array;
const writable = true;

const { defineProperty, getOwnPropertyDescriptors, keys: keysOf } = Object;

// -----------------------------------------------------------------------------
// Defining Option Types

/** The configuration type for file path options. */
export const FilePath = (value, report) => {
  if (typeof value === 'string') return resolve(value);
  return report(`is not a valid file path`);
};

/** The configuration type for glob options. */
export const FileGlob = (globs, report) => {
  if (typeof globs === 'string') {
    globs = [globs];
  } else if (isArray(globs)) {
    if (globs.filter(g => typeof g !== 'string').length) {
      return report(`is not an array of valid file globs`);
    }
  } else {
    return report('is not a valid file glob');
  }

  try {
    return createGlobMatcher(...globs);
  } catch {
    return report('contains an invalid segment glob expression');
  }
};

// -----------------------------------------------------------------------------
// Building a Configuration

/**
 * Instantiate the default configuration with options for help, version, and
 * output volume.
 */
export const defaults = () => ({
  h: 'help',
  help: Boolean,

  q: 'quiet',
  quiet: Boolean,

  v: 'verbose',
  verbose: Boolean,

  V: 'version',
  version: Boolean,

  get volume() {
    return (this.verbose || 0) - (this.quiet || 0);
  },
  set volume(v) {
    defineProperty(this, 'volume', {
      configurable,
      enumerable,
      writable,
      value: v,
    });
  },
});

/** Add dashed alias for camel-cased options if they don't already exist. */
export const aliased = config => {
  for (const key of keysOf(config)) {
    const dashed = key.replace(/[A-Z]/gu, s => `-${s.toLowerCase()}`);
    if (dashed !== key && !has(config, dashed)) {
      config[dashed] = key;
    }
  }
  return config;
};

// -----------------------------------------------------------------------------
// Internal Helper Functions

const initializeOptions = config => {
  const descriptors = getOwnPropertyDescriptors(config);
  const options = {};

  for (const key of keysOf(descriptors)) {
    if (key === '_') continue;

    const descriptor = descriptors[key];
    if (!has(descriptor, 'value')) {
      defineProperty(options, key, descriptor);
    }
  }

  return options;
};

const lookupConfiguration = (option, config) => {
  if (option === '_') {
    return {
      name: '_',
      type: typeof config._ === 'function' ? config._ : v => v,
    };
  }

  let name = option;
  let type = config[name];
  while (typeof type === 'string') {
    name = type;
    type = config[name];
  }

  let description;
  if (typeof type !== 'function') {
    description = `"${option}"`;
    type = undefined;
  } else if (option !== name) {
    description = `"${option}"/"${name}"`;
  } else {
    description = `"${option}"`;
  }

  return { name, type, description };
};

const optionsOrThrow = (options, errors) => {
  if (errors.length === 1) {
    throw new Error(errors[0]);
  } else if (errors.length) {
    throw new Error(`invalid options:${EOL}${errors.join(EOL)}`);
  } else {
    return options;
  }
};

// -----------------------------------------------------------------------------

/**
 * Determine configuration options based on object properties. This function
 * validates the properties against the given configuration.
 */
export const optionsFromObject = (options, config) => {
  const result = initializeOptions(config);
  const errors = [];

  for (let option of keysOf(options)) {
    const { name, type, description } = lookupConfiguration(option, config);

    if (type === undefined) {
      errors.push(`unknown option ${description}`);
    } else if (type === Boolean) {
      const v = options[option];
      const t = typeof v;

      if (t === 'boolean' || t === 'number') {
        result[name] = Number(v) + (result[name] || 0);
      } else {
        errors.push(
          `boolean option ${description} has neither boolean nor numeric value`
        );
      }
    } else if (name === '_') {
      const v = options[option];
      if (!isArray(v)) {
        errors.push(`option "_" does not have array value`);
      } else {
        const report = msg => {
          errors.push(`element of option "_" ${msg}`);
        };
        for (const el of v) {
          if (!result._) result._ = [];
          result._.push(type(el, report));
        }
      }
    } else {
      const report = msg => {
        errors.push(`option ${description} ${msg}`);
      };
      result[name] = type(options[option], report);
    }
  }

  return optionsOrThrow(result, errors);
};

/**
 * Determine configuration options based on command line arguments. This
 * function parses the arguments according to the given configuration.
 */
export const optionsFromArguments = (
  argv = process.argv.slice(2),
  config = defaults()
) => {
  const options = initializeOptions(config);
  const errors = [];
  let cursor = 0;

  const setopt = (arg, key, value) => {
    const { name, type, description } = lookupConfiguration(key, config);

    if (type === undefined) {
      errors.push(`unknown command line option ${description}`);
    } else if (type === Boolean) {
      options[name] = value + (options[name] || 0);
    } else if (!arg.startsWith('--')) {
      errors.push(
        `command line option ${description} misconfigured to take value`
      );
    } else if (cursor + 1 >= argv.length) {
      errors.push(
        `command line option ${description} is missing required value`
      );
    } else {
      value = argv[++cursor];
      if (value.startsWith('-')) {
        errors.push(
          `command line option ${description} has another option "${value}" as value`
        );
      } else {
        const reportError = msg => {
          errors.push(`command line option ${description} ${msg}`);
        };
        options[name] = type(value, reportError);
      }
    }
  };

  const validate = typeof config._ === 'function' ? config._ : a => a;
  let processOptions = true;

  while (cursor < argv.length) {
    let arg = argv[cursor];

    // Process as option.
    if (processOptions && arg.charCodeAt(0) === DASH) {
      if (arg === '--') {
        processOptions = false;
      } else if (arg.charCodeAt(1) !== DASH) {
        for (const key of arg.slice(1)) {
          setopt(arg, key, 1);
        }
      } else {
        let key = arg.slice(2);
        setopt(arg, key, 1);
      }
      cursor++;
      continue;
    }

    // Process as argument.
    const report = msg => {
      errors.push(`command line argument "${arg}" ${msg}`);
    };
    if (!options._) options._ = [];
    options._.push(validate(arg, report));
    cursor++;
  }

  return optionsOrThrow(options, errors);
};
