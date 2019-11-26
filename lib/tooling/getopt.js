/**
 * @module tooling/getopt
 * @copyright (C) 2009 Robert Grimm
 */

const configurable = true;
const { defineProperty, getOwnPropertyDescriptors, keys: keysOf } = Object;
const enumerable = true;
const { has } = Reflect;
const writable = true;

const defaults = () => ({
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

export default function getopt(
  argv = process.argv.slice(2),
  config = getopt.defaults()
) {
  const options = { _: [] };
  const errors = [];

  const descriptors = getOwnPropertyDescriptors(config);
  for (const key of keysOf(descriptors)) {
    // The `_` property is handled below.
    if (key === '_') continue;

    // For camel-cased properties, make dashed version an alias (if missing).
    const dashed = key.replace(/[A-Z]/gu, s => `-${s.toLowerCase()}`);
    if (dashed !== key && !has(config, dashed)) {
      config[dashed] = key;
    }

    // Correctly handle computed properties, e.g., volume.
    const descriptor = descriptors[key];
    if (!has(descriptor, 'value')) {
      defineProperty(options, key, descriptor);
    } else if (descriptor.value === Boolean) {
      options[key] = 0;
    }
  }

  const validate = typeof config._ === 'function' ? config._ : a => a;
  const reportError = msg => {
    errors.push(msg);
  };
  let cursor = 0;

  const setopt = (arg, key, value) => {
    let type = config[key];
    while (typeof type === 'string') {
      key = type;
      type = config[key];
    }

    if (type === undefined) {
      errors.push(`option "${key}" derived from argument "${arg}" is unknown`);
    } else if (type === Boolean) {
      options[key] += value;
    } else if (!arg.startsWith('--')) {
      errors.push(
        `option "${key}" derived from argument "${arg}" must be flag`
      );
    } else if (cursor + 1 >= argv.length) {
      errors.push(
        `option "${key}" derived from argument "${arg}" is last argument but requires value`
      );
    } else {
      value = argv[++cursor];
      if (value.startsWith('-')) {
        errors.push(
          `option "${key}" derived from argument "${arg}" has flag "${value}" as value`
        );
      } else {
        options[key] = type(value, options[key]);
      }
    }
  };

  while (cursor < argv.length) {
    let arg = argv[cursor];

    if (arg === '--') {
      cursor++;
      break;
    } else if (arg.startsWith('--')) {
      let key = arg.slice(2);
      setopt(arg, key, 1);
    } else if (arg.startsWith('-')) {
      for (const key of arg.slice(1)) {
        setopt(arg, key, 1);
      }
    } else {
      options._.push(validate(arg, reportError));
    }

    cursor++;
  }

  if (errors.length) throw new Error(errors.join('; '));
  options._.push(...argv.slice(cursor).map(arg => validate(arg, reportError)));
  return options;
}

defineProperty(getopt, 'defaults', {
  configurable,
  value: defaults,
});
