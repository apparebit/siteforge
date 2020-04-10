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

const noop = () => {};
noop.active = false;

const levels = {
  error: { label: '[ERROR]', threshold: -2, style: 'red' },
  warning: { label: '[WARN] ', threshold: -1, style: 'orange' },
  success: { label: '[W00T] ', threshold: 0, style: 'bold' },
  notice: { label: '[NOTE] ', threshold: 0, style: 'bold' },
  info: { label: '[INFO] ', threshold: 1, style: 'plain' },
  debug: { label: '[DEBUG]', threshold: 2, style: 'faint' },
};

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
  return function signOff({ files, pass, fail, duration }) {
    const { errors, warnings } = this;
    const details = { duration, errors, warnings };

    if (typeof files === 'number') {
      details.files = files;
    } else if (typeof fail === 'number' && typeof pass === 'number') {
      details.pass = pass;
      details.fail = fail;
    }

    const method = errors ? 'error' : warnings ? 'warning' : 'success';
    this[method](`Done!`, details);
  };
};

// -----------------------------------------------------------------------------

const createTextLogger = (
  println,
  level,
  { label, service, stylePrimary, styleDetail }
) => {
  label = label || `[${level.toUpperCase()}]`;
  const status = `${label} ${service ? `${service}: ` : ``}`;
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
  { labels, service, styleFailure, styleSuccess, banner }
) => {
  return function signOff({ files, pass, fail, duration }) {
    // Construct Sign Off Message
    const { errors, warnings } = this;

    let message;
    const withErrorsAndWarnings = () => {
      if (errors) {
        message += ` with ${format.count(errors, 'error')}`;
        if (warnings) message += ` and ${format.count(warnings, 'warning')}`;
      } else if (warnings) {
        message += ` with ${format.count(warnings, 'warning')}`;
      } else {
        message += ` with no errors and no warnings`;
      }
      message += '!';
    };

    if (typeof files === 'number') {
      // ------------------------------------------------------------------
      // <s> processed <f> files in <d> s with <e> errors and <w> warnings!
      // ------------------------------------------------------------------
      message =
        (errors ? labels.error : warnings ? labels.warning : labels.success) +
        (service ? ` ${service} processed ` : ` Processed `) +
        format.count(files, 'file') +
        ' in ' +
        format.duration(duration);
      withErrorsAndWarnings();
    } else if (typeof fail === 'number' && typeof pass === 'number') {
      if (fail) {
        // ---------------------------------------
        // <f> out of <f+p> tests failed in <d> s!
        // ---------------------------------------
        message =
          labels.error +
          (service ? ` ${service}: ` : ``) +
          ` ${fail} out of ${pass + fail} tests failed` +
          ` in ${format.duration(duration)}!`;
      } else {
        // ------------------------------
        // All <p> tests passed in <d> s!
        // ------------------------------
        message = `${labels.success} ${
          service ? `${service}: ` : ``
        }All ${pass} tests passed in ${format.duration(duration)}!`;
      }
    } else {
      // Done with <e> errors and <w> warnings!
      message = `Script "${process.argv[1]}" ran`;
      withErrorsAndWarnings();
    }

    // Style and print message.
    let style;
    if (errors || warnings || fail) {
      process.exitCode = 70; // X_SOFTWARE
      style = styleFailure;
    } else {
      style = styleSuccess;
    }

    if (banner) {
      println();
      const spacer = ' '.repeat(message.length + 4);
      for (const line of [spacer, '  ' + message + '  ', spacer]) {
        println(style(line));
      }
      println();
    } else {
      println(style(message));
    }
  };
};

// -----------------------------------------------------------------------------

export default function Rollcall(options = {}) {
  if (!new.target) return new Rollcall(options);

  const {
    banner = false,
    candy = makeCandy({ stream: console._stderr }),
    json = false,
    println = console.error,
    service,
    volume = 0,
  } = options;

  const createLogger = json ? createJSONLogger : createTextLogger;
  const createSignOff = json ? createJSONSignOff : createTextSignOff;

  for (const level of keysOf(levels)) {
    const { label, style, threshold } = levels[level];
    const stylePrimary = candy[style];
    const styleDetail = candy.faint;

    if (volume < threshold) {
      defineProperty(this, level, { configurable, value: noop });
    } else {
      defineProperty(this, level, {
        configurable,
        value: createLogger(println, level, {
          label,
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
  const labels = ['success', 'warning', 'error'].reduce(
    (labels, level) => ((labels[level] = levels[level].label), labels),
    {}
  );

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
        banner,
        labels,
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
