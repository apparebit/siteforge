/* © 2019–2020 Robert Grimm */

import { EOL } from 'os';
import * as format from '@grr/oddjob/format';
import makeCandy from '@grr/oddjob/candy';
import pickle from '@grr/oddjob/pickle';
import { traceErrorPosition } from '@grr/oddjob/error';
import { types } from 'util';

const BOLDED = /<b>(.*?)<\/b>/gu;
const configurable = true;
const { defineProperties, defineProperty, entries, keys: keysOf } = Object;
const { isArray } = Array;
const { isNativeError } = types;
const MINUS = '-'.charCodeAt(0);
const PLUS = '+'.charCodeAt(0);
const writable = true;

// -----------------------------------------------------------------------------

const noop = () => {};
noop.active = false;

const levels = {
  error: { label: '[ERROR]', threshold: -2, style: 'boldRed' },
  warning: { label: '[WARN] ', threshold: -1, style: 'boldOrange' },
  success: { label: '[NOTE] ', threshold: 0, style: 'boldGreen' },
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
    /* c8 ignore next */
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

const createTextLogger = (
  println,
  level,
  { label, service, stylePrimary, styleDetail }
) => {
  const status =
    (service ? `${service} ` : ``) +
    (label ? `${label} ` : `[${level.toUpperCase()}] `);
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

// -----------------------------------------------------------------------------

const createJSONReporter = () => {
  return function report(result) {
    if (!result.ok) this.error('Test failed!', result);
  };
};

const { stdout, stderr } = process;
const writeStdOut = stdout.write.bind(stdout);
const writeStdErr = stderr.write.bind(stderr);

let dotted = false;
let newlineAfterDots;

const patchStdio = write => {
  newlineAfterDots = () => {
    if (dotted) {
      dotted = false;
      write(EOL);
    }
  };

  stdout.write = (chunk, encoding, callback) => {
    newlineAfterDots();
    writeStdOut(chunk, encoding, callback);
  };

  stderr.write = (chunk, encoding, callback) => {
    newlineAfterDots();
    writeStdErr(chunk, encoding, callback);
  };
};

const createTextReporter = (println, { styleSuccess, styleFailure, write }) => {
  return function report({ ok, fullname, name, diag: { diff, stack } = {} }) {
    if (!newlineAfterDots) patchStdio(write);

    if (ok) {
      dotted = true;
      write('.');
      return;
    }

    newlineAfterDots();
    this.errors++;

    let msg = '';
    if (fullname) {
      msg += `${fullname}: ${name}${EOL}`;
    } else {
      msg += `${name}${EOL}`;
    }

    if (stack) {
      msg +=
        `    at ` +
        stack
          .trim()
          .split(/\r?\n/gu)
          .join(EOL + '    at ') +
        EOL;
    }

    if (diff) {
      msg += EOL;
      const lines = diff.trim().split(/\r?\n/gu);
      for (const [index, line] of lines.entries()) {
        if (index >= 2) {
          const code = line.charCodeAt(0);
          if (code === MINUS) {
            msg += styleFailure(line) + EOL;
            continue;
          } else if (code === PLUS) {
            msg += styleSuccess(line) + EOL;
            continue;
          }
        }

        msg += line + EOL;
      }
    }

    println(msg);
  };
};

// -----------------------------------------------------------------------------

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

const createTextSignOff = (
  println,
  { labels, service, styleFailure, styleSuccess, banner }
) => {
  return function signOff({ files, pass, fail, duration }) {
    // Construct Sign Off Message
    const { errors, warnings } = this;

    let message = service ? `${service} ` : ``;
    if (typeof pass === 'number' && typeof fail === 'number') {
      message += fail ? labels.error : labels.success;
      if (fail) {
        message += ` ${fail} out of ${pass + fail} tests failed`;
      } else {
        message += ` All ${pass} tests passed`;
      }
      message += ` in ${format.duration(duration)}!`;
    } else {
      message += errors
        ? labels.error
        : warnings
        ? labels.warning
        : labels.success;
      if (typeof files === 'number') {
        message += ` Processed ${format.count(files, 'file')} in `;
      } else {
        message += ` Ran for `;
      }
      message += format.duration(duration);
      if (errors) {
        message += ` with ${format.count(errors, 'error')}`;
        if (warnings) message += ` and ${format.count(warnings, 'warning')}`;
      } else if (warnings) {
        message += ` with ${format.count(warnings, 'warning')}`;
      } else {
        message += ` with no errors and no warnings`;
      }
      message += '!';
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
    write = writeStdErr,
    service,
    volume = 0,
  } = options;

  const createLogger = json ? createJSONLogger : createTextLogger;
  const createReporter = json ? createJSONReporter : createTextReporter;
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

  const labels = ['success', 'warning', 'error'].reduce(
    (labels, level) => ((labels[level] = levels[level].label), labels),
    {}
  );

  defineProperties(this, {
    embolden: {
      configurable,
      value: s => s.replace(BOLDED, (_, text) => candy.bold(text)),
    },
    println: {
      configurable,
      value: println,
    },
    report: {
      configurable,
      value: createReporter(println, {
        styleFailure: candy.red,
        styleSuccess: candy.green,
        write,
      }),
    },
    signOff: {
      configurable,
      value: createSignOff(println, {
        banner,
        labels,
        service,
        styleFailure: candy.overRed,
        styleSuccess: candy.overGreen,
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
