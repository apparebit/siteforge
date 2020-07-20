/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { basename } from 'path';
import { EOL } from 'os';
import * as format from '@grr/oddjob/format';
import { inspect } from 'util';
import {
  isUnadornedError,
  traceErrorMessage,
  traceErrorPosition,
} from '@grr/oddjob/error';
import { isStringArray } from '@grr/oddjob/types';
import makeCandy from '@grr/oddjob/candy';
import pickle from '@grr/oddjob/pickle';

const { freeze, keys: keysOf } = Object;
const { max } = Math;
const { species } = Symbol;

const MINUS = '-'.charCodeAt(0);
const PLUS = '+'.charCodeAt(0);
const STRONG = Symbol('strong');
const WIDTH_LABEL = 10;
const WIDTH_LEVEL = 8;

const LEVEL = (() => {
  const data = {
    error: { threshold: -2, style: 'boldRed', strong: 'overRed' },
    warn: { threshold: -1, style: 'boldOrange' },
    aok: { threshold: 0, style: 'boldGreen', strong: 'overGreen' },
    note: { threshold: 0, style: 'bold' },
    info: { threshold: 1, style: 'plain' },
    debug: { threshold: 2, style: 'faint' },
    trace: { threshold: 3, style: 'fainter' },
  };

  for (const key of keysOf(data)) {
    data[key].name = `[${key.toUpperCase()}]`;
    data[key] = freeze(data[key]);
  }
  return freeze(data);
})();

// =============================================================================

/**
 * Determine the message and detail data for the given arguments. For developer
 * convenience, also determine the result and whether the mssage should be
 * highlighted.
 */
const splitArguments = (level, ...args) => {
  let strong = false;
  if (args.length && args[0] === STRONG) {
    args.shift();
    strong = true;
  }

  const { length } = args;
  let message, data, result;

  if (length === 0) {
    // Leave message and data undefined.
  } else if (length === 1) {
    result = args[0];
    if (typeof result === 'string') {
      // Use single argument as message.
      message = result;
    } else if (
      isUnadornedError(result) &&
      traceErrorPosition(result).length === 0
    ) {
      // Single argument is unadorned, traceless error. Reuse error message as
      // logged message. Also, if logging at error level, leave out error name.
      message = level === 'error' ? result.message : traceErrorMessage(result);
    } else {
      // Use single argument as data.
      data = result;
    }
  } else if (typeof args[0] === 'string') {
    message = args.shift();

    if (length === 2) {
      result = data = args[0];

      if (isUnadornedError(result)) {
        message += `: ${data.message}`;
        data = traceErrorPosition(data).map(loc => `at ` + loc);
        if (data.length === 0) data = undefined;
      }
    } else {
      result = data = args;
    }
  } else {
    result = data = args;
  }

  return { message, data, result, strong };
};

// =============================================================================

const maybeStartLine = (logger, output) => {
  if (output.inline) return false;

  output.inline = true;
  logger.onLineStart();
  return true;
};

const maybeEndLine = (logger, output) => {
  if (!output.inline) return false;

  output.inline = false;
  output.stream.write(EOL);
  logger.onLineEnd();
  return true;
};

// =============================================================================

/**
 * A logger. This class provides a high-level logging facility similar to
 * JavaScript's `console` but with important differences:
 *
 *   * Output can be in newline-delimited JSON format or in possibly styled
 *     text.
 *   * In either case, logged messages include a timestamp and label, with the
 *     latter representing the logging component.
 *   * Supported logging levels are error (-2), warn (-1), aok (0), note (0),
 *     info (1), debug (2), and trace (2).
 *   * The logger's volume (by default 0) controls which levels are printed and
 *     which aren't. The volume required for each level is given in parentheses
 *     above. The aok and note levels have the same priority, but differ
 *     semantically.
 *   * Calls to several logging methods may be grouped into one semantic message
 *     via `maybeStartMessage()`, `startMessage()`, and `endMessage()`. If a
 *     logging method is invoked outside a pair of the message marking methods,
 *     it is treated as a message by itself.
 *   * While the logger exposes the underlying `println()` for actually emitting
 *     text, applications should avoid calling it directly. They may, however,
 *     make use of `print()` if they need to print fragments of a line at a
 *     time. The logger automatically terminates that line before printing a
 *     regular message.
 *   * To help with customization, the logger emits `onMessageStart()` and
 *     `onMessageEnd()` notifications for messages and `onLineStart()` and
 *     `onLineEnd()` notifications for line fragments.
 *   * The choice of JSON or text, the logger's label, and the logger's volume
 *     can be reconfigured. Doing so creates a new instance that shares the
 *     stream, line, and message state.
 */
export default class Rollcall {
  static get Strong() {
    return STRONG;
  }

  // ---------------------------------------------------------------------------

  #json;
  #candy;
  #output;
  #volume;
  #label;
  #stats;

  constructor(options = {}) {
    if (options instanceof Rollcall) {
      // Create a copy that shares #candy and #stats.
      this.#json = options.#json;
      this.#candy = options.#candy;
      this.#output = options.#output;
      this.#volume = options.#volume;
      this.#label = options.#label;
      this.#stats = options.#stats;
    } else {
      // Create a new instance based on provided options or defaults.
      let { json, label, stream, volume } = options;

      if (label == null) {
        const { title } = process;
        if (title.includes('/')) {
          label = basename(title);
        } else {
          label = title;
        }
      } else {
        label = String(label);
      }

      const output = {
        stream: stream ?? process.stderr,
        inline: false,
        inMessage: false,
      };

      this.#json = json ?? false;
      this.#candy = makeCandy({ stream: output.stream });
      this.#output = output;
      this.#volume = volume ?? 0;
      this.#label = label;
      this.#stats = {
        error: 0,
        warn: 0,
        aok: 0,
        note: 0,
        info: 0,
        debug: 0,
        trace: 0,
      };
    }
  }

  get json() {
    return this.#json;
  }

  get candy() {
    return this.#candy;
  }

  get volume() {
    return this.#volume;
  }

  get label() {
    return this.#label;
  }

  get errors() {
    return this.#stats.error;
  }

  get warnings() {
    return this.#stats.warn;
  }

  // ---------------------------------------------------------------------------

  withJSON(flag) {
    if (this.#json === flag) return this;

    const constructor = this.constructor[species] ?? this.constructor;
    const fork = new constructor(this);
    fork.#json = flag;
    return fork;
  }

  withVolume(volume) {
    if (typeof volume !== 'number') {
      throw new Error(`volume "${volume}" is not a number`);
    }

    const constructor = this.constructor[species] ?? this.constructor;
    const fork = new constructor(this);
    fork.#volume = volume;
    return fork;
  }

  withLabel(label) {
    const constructor = this.constructor[species] ?? this.constructor;
    const fork = new constructor(this);
    fork.#label = String(label);
    return fork;
  }

  // ===========================================================================

  error(...args) {
    return this.log('error', ...args);
  }

  warn(...args) {
    return this.log('warn', ...args);
  }

  aok(...args) {
    return this.log('aok', ...args);
  }

  note(...args) {
    return this.log('note', ...args);
  }

  info(...args) {
    return this.log('info', ...args);
  }

  debug(...args) {
    return this.log('debug', ...args);
  }

  trace(...args) {
    return this.log('trace', ...args);
  }

  // ---------------------------------------------------------------------------

  log(level, ...args) {
    if (this.#volume < LEVEL[level].threshold) return undefined;
    this.#stats[level]++;

    const { message, data, result, strong } = splitArguments(level, ...args);

    // Handle JSON mode.
    if (this.#json) {
      const started = this.maybeStartMessage();
      try {
        this.println(
          pickle({
            timestamp: this.timestamp(),
            label: this.label,
            level,
            message,
            data,
          })
        );
      } finally {
        if (started) this.endMessage();
      }
      return result;
    }

    // Determine style for text mode.
    const { candy } = this;
    let desc = LEVEL[level];
    const style =
      strong && desc.strong ? candy[desc.strong] : candy[desc.style];

    // Format extra lines.
    let extralines;
    if (data) {
      if (isStringArray(data)) {
        extralines = data;
      } else {
        extralines = inspect(data).split(/\r?\n/gu);
      }
    } else {
      extralines = [];
    }

    // Format first line.
    let firstline;
    if (strong) {
      firstline = desc.name.padEnd(WIDTH_LEVEL);
    } else {
      const padding = ' '.repeat(max(0, WIDTH_LEVEL - desc.name.length));
      firstline = style(desc.name) + padding;
    }
    if (message) {
      firstline += message;
    } else if (extralines.length) {
      firstline += `Logged data:`;
    } else {
      firstline += `---`;
    }
    if (strong) {
      firstline = style(firstline);
    }

    const timestamp = this.timestamp();
    let prefix = timestamp ? candy.faint(timestamp) + ' ' : '';
    if (this.label) prefix += this.label.padStart(WIDTH_LABEL);
    firstline = prefix + ' ' + firstline;

    // Write it all out.
    const started = this.maybeStartMessage();
    try {
      this.println(firstline);
      for (const line of extralines) {
        this.println(this.indent() + candy.faint(line));
      }
    } finally {
      if (started) this.endMessage();
    }
    return result;
  }

  // ===========================================================================

  section(number, title) {
    if (this.#json) {
      return this.note(`Section`, { number, title });
    } else {
      return this.note(`§${number} ${title}`);
    }
  }

  done({ files = undefined, duration }) {
    const { errors, warnings } = this;
    const level = errors ? 'error' : warnings ? 'warn' : 'aok';
    if (errors) {
      process.exitCode = 70; // X_SOFTWARE
    }

    // In JSON:
    if (this.#json) {
      return this.log(level, 'Done', { files, errors, warnings, duration });
    }

    // In text:
    let message;
    if (files) {
      message = `Processed ${format.count(files, 'file')} in `;
    } else {
      message = `Ran for `;
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
    return this.log(level, STRONG, message);
  }

  // ---------------------------------------------------------------------------

  test(result) {
    const { ok, fullname, name, diag: { diff, stack } = {} } = result;
    const message = fullname ? `${fullname}: ${name}` : name;

    if (this.#json) {
      if (!ok) this.log('error', message, { diff, stack });
    } else if (ok) {
      this.print('.');
    } else {
      this.startMessage();

      // The actual error.
      this.log('error', message);

      // The error stack.
      if (stack) {
        for (const line of stack.split(/\r?\n/gu)) {
          if (line) {
            this.println(this.indent() + 'at ' + line);
          } else {
            this.println();
          }
        }
      }

      // The difference between expected and actual result.
      if (diff) {
        for (let line of diff.split(/\r?\n/gu)) {
          const code = line.charCodeAt(0);
          if (code === MINUS) {
            line = this.#candy.red(line);
          } else if (code === PLUS) {
            line = this.#candy.green(line);
          }
          this.println(this.indent() + line);
        }
      }

      this.endMessage();
    }
  }

  doneTesting({ pass, fail, duration }) {
    const level = fail ? 'error' : 'aok';
    if (fail) {
      process.exitCode = 70; // X_SOFTWARE
    }

    if (this.#json) {
      return this.log(level, 'Done', { pass, fail, duration });
    }

    let message = `Done! `;
    if (fail) {
      message += `${fail} out of ${pass + fail} tests failed`;
    } else {
      message += `All ${pass} tests passed`;
    }
    message += ` in ${format.duration(duration)}`;
    return this.log(level, STRONG, message);
  }

  // ===========================================================================

  embolden(text) {
    return text.replace(/<b>(.*?)<\/b>/gu, (_, text) => this.#candy.bold(text));
  }

  emphasize(text) {
    return text.replace(/<i>(.*?)<\/i>/gu, (_, text) =>
      this.#candy.italic(text)
    );
  }

  underline(text) {
    return text.replace(/<u>(.*?)<\/u>/gu, (_, text) =>
      this.#candy.underline(text)
    );
  }

  /** Replace <b>, <i>, and <u> markup with corresponding ANSI escape codes. */
  embellish(text) {
    return text
      .replace(/<b>(.*?)<\/b>/gu, (_, text) => this.#candy.bold(text))
      .replace(/<i>(.*?)<\/i>/gu, (_, text) => this.#candy.italic(text))
      .replace(/<u>(.*?)<\/u>/gu, (_, text) => this.#candy.underline(text));
  }

  timestamp() {
    return new Date().toISOString();
  }

  indent() {
    return '    ';
  }

  // ---------------------------------------------------------------------------

  /**
   * Start a new message if one hasn't already been started. This method
   * returns `true` when it did start a new message.
   */
  maybeStartMessage() {
    return this.#output.inMessage ? false : this.startMessage();
  }

  /** Start a new message. This method throws if one has already started. */
  startMessage() {
    const output = this.#output;
    assert(!output.inMessage);

    maybeEndLine(this, output);
    output.inMessage = true;
    this.onMessageStart();
    return true;
  }

  /** End the current message. This method throws if none has been started. */
  endMessage() {
    const output = this.#output;
    assert(output.inMessage);

    maybeEndLine(this, output);
    output.inMessage = false;
    this.onMessageEnd();
    return true;
  }

  /** Signal start of an incomplete line. */
  onLineStart() {}

  /** Signal end of an incomplete line. */
  onLineEnd() {}

  /** Signal start of a message. */
  onMessageStart() {}

  /** Signal end of a message. */
  onMessageEnd() {}

  // ---------------------------------------------------------------------------

  println(text) {
    const output = this.#output;
    maybeEndLine(this, output);
    output.stream.write(text == null ? EOL : text + EOL);
  }

  /**
   * Print the given text.
   *
   * Most applications should not use this method. In particular, if possible,
   * an application should format any line output internally and then invoke
   * `println(line)`, where `line` is the result. If a logical message spans
   * more than one line, the application should invoke `startMessage()` before
   * printing the first line and invoke `endMessage()` after printing the last
   * line.
   *
   * However, if the application needs to generate output at smaller than line
   * granularity, it may use this method. In that case, the application should
   * emit new lines either by invoking `println()` without argument or by
   * invoking `print(EOL)`. But it should not include `EOL` within text passed
   * to this method.
   */
  print(text) {
    const output = this.#output;
    maybeStartLine(this, output);
    if (text === EOL) {
      maybeEndLine(this, output);
    } else {
      output.stream.write(text);
    }
  }
}
