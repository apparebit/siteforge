/* © 2019–2020 Robert Grimm */

import makeCandy from '@grr/oddjob/candy';
import { traceErrorPosition } from '@grr/oddjob/error';
import * as format from '@grr/oddjob/format';
import pickle from '@grr/oddjob/pickle';
import { types } from 'util';

const BOLDED = /<b>(.*?)<\/b>/gu;
const configurable = true;
const { defineProperties, defineProperty, entries, keys: keysOf } = Object;
const { isArray } = Array;
const { isNativeError } = types;
const writable = true;

// -----------------------------------------------------------------------------

const createJSONLogger = (println, level, { service }) => {
  const status =
    (service ? `,"service":"${service}"` : ``) + `,"level":"${level}"`;
  const count = `${level}s`;

  const log = function log(...args) {
    const { code, message, data } = this.toCodeMessageData(args);
    this[count]++;

    let line = `{"timestamp":"${new Date().toISOString()}"` + status;
    if (code) line += `,"code":"${code}"`;
    if (message) line += `,"message":${pickle(message)}`;
    if (data) line += `,"data":${pickle(data)}`;
    line += `}`;

    println(line);
  };

  defineProperties(log, {
    name: { configurable, value: level },
    length: { configurable, value: 2 },
  });

  return log;
};

const createJSONSignOff = () => {
  return function signOff({ files, duration }) {
    const { errors, warnings } = this;
    const details = { files, duration, errors, warnings };
    const method = errors ? 'error' : warnings ? 'warning' : 'success';
    this[method](`Done!`, details);
  };
};

// -----------------------------------------------------------------------------

const createTextLogger = (
  println,
  level,
  { service, stylePrimary, styleDetail }
) => {
  const status = `[${level.toUpperCase()}] ${service ? `<${service}> ` : ``}`;
  const count = `${level}s`;

  const log = function log(...args) {
    let { message, data } = this.toCodeMessageData(args);
    this[count]++;

    let extraLines;
    if (isNativeError(data) || data instanceof Error) {
      // Check stack for position trace.
      extraLines = traceErrorPosition(data);
      if (extraLines.length === 0) {
        // If there are no positions, hoist message.
        message += ': ' + data.message;
        extraLines = null;
      } else {
        extraLines = data.stack.split(/\r?\n/gu);
      }
    } else if (
      styleDetail == null ||
      data == null ||
      typeof data !== 'object'
    ) {
      extraLines = null;
    } else if (isArray(data)) {
      extraLines = data.map(String);
    } else {
      extraLines = [];
      for (let [key, value] of entries(data)) {
        extraLines.push(`${key}: ${value}`);
      }
    }

    println(stylePrimary(status + message));
    if (styleDetail && extraLines) {
      for (const line of extraLines) {
        println(styleDetail(line));
      }
    }
  };

  defineProperties(log, {
    name: { configurable, value: level },
    length: { configurable, value: 2 },
  });

  return log;
};

const createTextSignOff = (
  println,
  { service, styleFailure, styleSuccess, banner }
) => {
  return function signOff({ files, duration }) {
    // Build message.
    let { errors, warnings } = this;
    let message =
      (errors ? '[ERROR]' : warnings ? '[WARNING]' : '[SUCCESS]') +
      (service ? ` ${service} processed ` : ` Processed `) +
      format.count(files, 'file') +
      ' in ' +
      format.duration(duration);
    if (errors) {
      message += ` with ${format.count(errors, 'error')}`;
      if (warnings) message += ` and ${format.count(warnings, 'warning')}`;
    } else if (warnings) {
      message += ` with ${format.count(warnings, 'warning')}`;
    }
    message += '!';

    // Format and print message.
    const style = errors || warnings ? styleFailure : styleSuccess;
    if (banner) {
      const spacer = ' '.repeat(message.length + 4);
      for (const line of [spacer, '  ' + message + '  ', spacer]) {
        println(style(line));
      }
    } else {
      println(style(message));
    }
  };
};

// -----------------------------------------------------------------------------

const noop = () => {};

const levels = {
  error: { threshold: -2, style: 'red' },
  warning: { threshold: -1, style: 'orange' },
  notice: { threshold: 0, style: 'bold' },
  info: { threshold: 1, style: 'plain' },
  debug: { threshold: 2, style: 'faint' },
};

export default function Rollcall(options = {}) {
  if (!new.target) return new Rollcall(options);

  const {
    candy = makeCandy({ stream: console._stderr }),
    json = false,
    println = console.error,
    service,
    volume = 0,
  } = options;

  const createLogger = json ? createJSONLogger : createTextLogger;
  const createSignOff = json ? createJSONSignOff : createTextSignOff;

  for (const level of keysOf(levels)) {
    const { style, threshold } = levels[level];
    const stylePrimary = candy[style];
    const styleDetail = candy.faint;

    if (volume < threshold) {
      defineProperty(this, level, { configurable, value: noop });
    } else {
      defineProperty(this, level, {
        configurable,
        value: createLogger(println, level, {
          service,
          stylePrimary,
          styleDetail,
        }),
      });
    }

    defineProperty(this, `${level}s`, { configurable, writable, value: 0 });
  }

  const styleFailure = candy.redBg;
  const styleSuccess = candy.greenBg;

  defineProperties(this, {
    embolden: {
      configurable,
      value: s => s.replace(BOLDED, span => candy.bold(span)),
    },
    newline: {
      configurable,
      value: () => println(),
    },
    signOff: {
      configurable,
      value: createSignOff(println, {
        service,
        styleFailure,
        styleSuccess,
      }),
    },
    toCodeMessageData: {
      configurable,
      value: function (args) {
        return { code: undefined, message: args[0], data: args[1] };
      },
    },
  });
}
