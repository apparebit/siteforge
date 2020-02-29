/* © 2019 Robert Grimm */

import { format } from 'util';

const configurable = true;
const { defineProperties, defineProperty, keys: keysOf } = Object;
const EOL = /\r?\n/gu;
const ERROR_PREFIX = /^([A-Za-z]*Error): /u;
const { has } = Reflect;
const isPlain =
  process.env.NODE_DISABLE_COLORS != null || process.env.NO_COLOR != null;
const { stringify } = JSON;
const { trunc } = Math;
const writable = true;

const styles = {
  bold: s => `\x1b[1m${s}\x1b[22m`,
  faint: s => `\x1b[90m${s}\x1b[39m`,
  green: s => `\x1b[1;32m${s}\x1b[39;22m`,
  magenta: s => `\x1b[1;35m${s}\x1b[39;22m`,
  orange: s => `\x1b[1;38;5;208m${s}\x1b[39;22m`,
  plain: s => s,
  red: s => `\x1b[1;31m${s}\x1b[39;22m`,
};

const adjust = style => (isPlain ? s => s : style);

const levels = {
  // Possibly add panic (-3) and trace (3).
  error: { volume: -2, format: adjust(styles.red) },
  warning: { volume: -1, format: adjust(styles.orange) },
  success: { volume: 0, format: adjust(styles.green) },
  notice: { volume: 0, format: adjust(styles.bold) },
  info: { volume: 1, format: adjust(styles.plain) },
  debug: { volume: 2, format: adjust(styles.faint) },
};

const chopOffErrorPrefix = s => {
  const [prefix] = ERROR_PREFIX.exec(s) || [];
  return prefix ? s.slice(prefix.length) : s;
};

const formatAsLines = (primary, ...rest) => {
  let diagnostic, explanation, detail;

  const isPrimaryText = typeof primary === 'string';
  const isPrimaryError = primary instanceof Error;
  if (isPrimaryError || (isPrimaryText && rest[0] instanceof Error)) {
    const error = isPrimaryError ? primary : rest[0];
    let message = (isPrimaryText ? primary + ' ' : '') + error.message;
    [diagnostic, ...explanation] = message.split(EOL);

    let offset = error.name.length + 2 + error.message.length + 1;
    if (error.stack.charCodeAt(offset) < 32) offset++;
    detail = error.stack.slice(offset).split(EOL);

    if (has(error, 'cause')) {
      let cause;
      if (error.cause instanceof Error) {
        cause = error.cause.message.split(EOL);
      } else {
        cause = String(error.cause.message).split(EOL);
      }
      (!explanation.length ? explanation : detail).push(...cause);
    }
  } else if (isPrimaryText) {
    [diagnostic, ...explanation] = format(primary, ...rest).split(EOL);
    detail = [];
  } else {
    [diagnostic, ...explanation] = String(primary).split(EOL);
    detail = rest.flatMap(v => String(v).split(EOL));
  }

  return { diagnostic, explanation, detail };
};

function createLogFunction(level, { label, println = console.error } = {}) {
  const prefix = label ? `${adjust(styles.magenta)(label)} ` : '';
  const counter = `${level}s`;
  const isError = level === 'error';
  const isWarning = level === 'warning';

  const printDiagnostic = s => println(prefix + levels[level].format(s));
  const printExplanation = s => println(prefix + s);
  const printDetail = s => println(prefix + adjust(styles.faint)(s));

  return function log(...args) {
    this[counter]++;

    let { diagnostic, explanation, detail } = formatAsLines(...args);
    if (isError && !ERROR_PREFIX.test(diagnostic)) {
      diagnostic = 'Error: ' + diagnostic;
      if (explanation[0]) explanation[0] = chopOffErrorPrefix(explanation[0]);
    } else if (isWarning) {
      diagnostic = 'Warning: ' + chopOffErrorPrefix(diagnostic);
      if (explanation[0]) explanation[0] = chopOffErrorPrefix(explanation[0]);
    }

    printDiagnostic(diagnostic);
    explanation.forEach(printExplanation);
    detail.forEach(printDetail);
  };
}

function createSignOff({ println = console.error } = {}) {
  return function signOff(start) {
    let timing;
    if (start) {
      let duration = Date.now() - start;
      timing = `${String(duration % 1000).padEnd(3, '0')}`; // millis

      duration = trunc(duration / 1000);
      const seconds = duration % 60;
      const minutes = trunc(duration / 60);

      if (minutes) {
        timing = `${`${seconds}`.padStart(2, '0')}.${timing}`;
        timing = `${minutes}:${timing}min`;
      } else if (seconds) {
        timing = `${seconds}.${timing}s`;
      } else {
        timing = timing + 'ms';
      }
    }

    if (!this.errors && !this.warnings) {
      let message = adjust(styles.green)(`Happy, happy, joy, joy!`);
      if (timing) message += adjust(styles.faint)(`  ${timing}`);
      println(message);
      return;
    }

    let message = `Finished with `;
    if (this.errors) {
      message += String(this.errors);
      message += this.errors > 1 ? ' errors' : ' error';
      message += this.warnings ? ' and ' : '.';
    }
    if (this.warnings) {
      message += String(this.warnings);
      message += this.warnings > 1 ? ' warnings.' : ' warning.';
    }
    message += ` So ${this.errors ? 'very ' : ''}sad!`;
    if (timing) message += adjust(styles.faint)(`  ${timing}`);
    println(message);
  };
}

function createJsonLogFunction(level, { label, println = console.error } = {}) {
  const counter = `${level}s`;
  const normalize = value => {
    if (value instanceof Error) {
      const replacement = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
      if (value.cause) replacement.cause = normalize(value.cause);
      return replacement;
    } else {
      return value;
    }
  };

  return function log(...args) {
    this[counter]++;
    println(stringify({ label, level, arguments: args }, normalize));
  };
}

function createJsonSignOff({ println = console.error } = {}) {
  return function signOff(start) {
    const duration = start ? Date.now() - start : -1;
    println(
      stringify({
        level: 'done',
        errors: this.errors,
        warnings: this.warnings,
        duration,
      })
    );
  };
}

export default function Logger({
  inJSON = false,
  label,
  println = console.error,
  volume = 0,
} = {}) {
  const logFunction = inJSON ? createJsonLogFunction : createLogFunction;
  const signOff = inJSON ? createJsonSignOff : createSignOff;

  for (const level of keysOf(levels)) {
    const descriptor = levels[level];

    if (volume < descriptor.volume) {
      defineProperty(this, level, { configurable, value: () => {} });
    } else {
      defineProperty(this, level, {
        configurable,
        value: logFunction(level, { label, println }),
      });
    }

    defineProperty(this, level + 's', {
      configurable,
      writable,
      value: 0,
    });
  }

  defineProperties(this, {
    newline: {
      configurable,
      value: () => println(),
    },
    signOff: {
      configurable,
      value: signOff({ println }),
    },
  });
}
