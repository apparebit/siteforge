/* © 2019–2020 Robert Grimm */

import {
  LEVELS,
  LEVEL_WIDTH,
  objectify,
  STYLES,
  toHumanTime,
} from './format.js';
import { types } from 'util';

const BOLDED = /<b>(.*?)<\/b>/gu;
const configurable = true;
const { defineProperties, defineProperty, keys: keysOf } = Object;
const { isArray } = Array;
const { isNativeError } = types;
const { stringify } = JSON;
const writable = true;

// -----------------------------------------------------------------------------

const createJSONLogger = ({ println, level, label }) => {
  const count = `${level}s`;

  return function(message, detail) {
    this[count]++;

    let line = `{"timestamp":"${new Date().toISOString()}",`;
    if (label) line += `"label":"${label}",`;
    line += `"level":"${level}",`;
    line += `"message":${stringify(message)}`;
    if (detail) line += `,"detail":${stringify(objectify(detail))}`;
    line += `}`;

    println(line);
  };
};

const createTextLogger = ({
  println,
  formatPrimary,
  formatDetail,
  level,
  label,
}) => {
  const count = `${level}s`;
  label = label ? `[${label}] ` : '';
  level = level.padEnd(LEVEL_WIDTH);
  const labelAndLevel = label + level;

  return function(message, detail) {
    this[count]++;

    const timestamp = new Date().toISOString() + ' ';
    println(timestamp + formatPrimary(labelAndLevel + message));
    if (detail == null || typeof detail !== 'object') return;

    const indent = ''.padEnd(timestamp.length);
    if (isNativeError(detail)) {
      // For errors, print message and stack trace.
      const lines = detail.stack.split(/\r?\n/u);
      lines[0] = detail.message;
      for (const line of lines) {
        println(formatDetail(indent + line));
      }
    } else if (isArray(detail)) {
      // For arrays, print each element as its own line.
      for (const line of detail) {
        println(formatDetail(`${indent}${line}`));
      }
    } else {
      // For all other objects, print each enumerable own property.
      const keys = keysOf(detail);
      const width = keys.reduce((w, n) => (n.length > w ? n.length : w), 0);
      for (const key of keys) {
        println(
          formatDetail(
            `${indent}${key.padEnd(width)}: ${stringify(detail[key])}`
          )
        );
      }
    }
  };
};

function signOff(duration) {
  const detail = [`site:forge ran for ${toHumanTime(duration)}`];
  if (!this.errors && !this.warnings) {
    return this.success(`Happy, happy, joy, joy!`, detail);
  }

  const fmtErrors = () =>
    `${this.errors} error` + (this.errors !== 1 ? 's' : '');
  const fmtWarnings = () =>
    `${this.warnings} warning` + (this.warnings !== 1 ? 's' : '');

  let message;
  if (this.errors) {
    message = fmtErrors();
    if (this.warnings) message += ` and ` + fmtWarnings();
  } else {
    message = fmtWarnings();
  }

  return this.error(message, detail);
}

// -----------------------------------------------------------------------------

export default function Logger(options = {}) {
  if (!new.target) return new Logger(options);

  const { NODE_DISABLE_COLORS, NO_COLOR } = process.env;

  const {
    json = false,
    label,
    println = console.error,
    stylish = NODE_DISABLE_COLORS === undefined && NO_COLOR === undefined,
    volume = 0,
  } = options;

  const formatBold = stylish ? STYLES.bold : STYLES.plain;
  const formatDetail = stylish ? STYLES.faint : STYLES.plain;

  for (const level of keysOf(LEVELS)) {
    const descriptor = LEVELS[level];

    if (volume < descriptor.volume) {
      defineProperty(this, level, { configurable, value: () => {} });
    } else {
      const logger = (json ? createJSONLogger : createTextLogger)({
        println,
        label,
        level,
        formatPrimary: stylish ? descriptor.format : STYLES.plain,
        formatDetail,
      });
      defineProperty(this, level, { configurable, value: logger });
    }

    defineProperty(this, `${level}s`, { configurable, writable, value: 0 });
  }

  defineProperties(this, {
    embolden: {
      configurable,
      value: s => s.replace(BOLDED, (_, span) => formatBold(span)),
    },
    newline: {
      configurable,
      value: () => println(),
    },
    signOff: {
      configurable,
      value: signOff,
    },
  });
}
