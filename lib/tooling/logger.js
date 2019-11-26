/**
 * @module tooling/logger
 * @copyright (C) 2009 Robert Grimm
 */

import { format } from 'util';
import { toolName } from '../config.js';

const ERROR_PREFIX = /^([A-Za-z]*Error|Warning): /u;
const configurable = true;
const isPlain = process.env.NODE_DISABLE_COLORS;
const { defineProperty, keys: keysOf } = Object;
const writable = true;

const styles = {
  red: s => `\x1b[1;31m${s}\x1b[39;22m`,
  orange: s => `\x1b[1;38;5;208m${s}\x1b[39;22m`,
  green: s => `\x1b[1;32m${s}\x1b[39;22m`,
  bold: s => `\x1b[1m${s}\x1b[22m`,
  plain: s => s,
  faint: s => `\x1b[90m${s}\x1b[39m`,
};

const adjustStyles = isPlain => ({
  red: isPlain ? styles.plain : styles.red,
  orange: isPlain ? styles.plain : styles.orange,
  green: isPlain ? styles.plain : styles.green,
  bold: isPlain ? styles.plain : styles.bold,
  plain: styles.plain,
  faint: isPlain ? styles.plain : styles.faint,
});

const adjustedStyles = adjustStyles(isPlain);

const levels = {
  // Possibly add panic (-3) and trace (3).
  error: { volume: -2, format: adjustedStyles.red },
  warning: { volume: -1, format: adjustedStyles.orange },
  success: { volume: 0, format: adjustedStyles.green },
  notice: { volume: 0, format: adjustedStyles.bold },
  info: { volume: 1, format: adjustedStyles.plain },
  debug: { volume: 2, format: adjustedStyles.faint },
};

function createLogFunction(
  level,
  { dedupe = true, target = toolName, println = console.error } = {}
) {
  const label = level[0].toUpperCase() + level.slice(1);
  const counter = `${level}s`;
  const isErrorOrWarning = level === 'error' || level === 'warning';
  const messageCounts = isErrorOrWarning ? new Map() : undefined;

  const printDiagnostic = s =>
    println(levels[level].format(`[${target}] ${s}`));
  const printExplanation = s => println(`[${target}] ${s}`);
  const printDetail = s => println(adjustedStyles.faint(`[${target}] ${s}`));

  return function log(...args) {
    // Count invocation.
    this[counter]++;

    // Determine three parts of message, with diagnostic and explanation taking
    // up one line each and detail possibly more than one line.
    let diagnostic, explanation, detail;
    if (args.length === 1 && args[0] instanceof Error) {
      [diagnostic, ...detail] = args[0].stack.split(/\r?\n/u);
    } else if (
      args.length === 2 &&
      typeof args[0] === 'string' &&
      args[1] instanceof Error
    ) {
      diagnostic = args[0] + ':';
      [explanation, ...detail] = args[1].stack.split(/\r?\n/u);
    } else {
      diagnostic = [format(...args)];
    }
    explanation = explanation || '';
    const [prefix] = ERROR_PREFIX.exec(explanation) || [];
    if (prefix) explanation = explanation.slice(prefix.length);
    detail = detail || [];

    if (isErrorOrWarning) {
      if (!ERROR_PREFIX.test(diagnostic)) {
        diagnostic = `${label}: ${diagnostic}`;
      }

      const text = diagnostic + '\n' + explanation + '\n' + detail.join('\n');
      const count = 1 + (messageCounts.get(text) || 0);
      messageCounts.set(text, count);
      if (dedupe && count > 1) return;
    }

    printDiagnostic(diagnostic);
    if (explanation) printExplanation(explanation);
    detail.forEach(printDetail);
  };
}

function createSignOff({ target = toolName, println = console.error } = {}) {
  const { bold, green } = adjustedStyles;

  return function signOff() {
    if (!this.errors && !this.warnings) {
      println(green(`[${target}] Happy, happy, joy, joy`));
      return;
    }

    let msg = `[${target}] Finished with `;
    if (this.errors) {
      msg += String(this.errors);
      msg += this.errors > 1 ? ' errors' : ' error';
      if (this.warnings) msg += ' and ';
    }
    if (this.warnings) {
      msg += String(this.warnings);
      msg += this.warnings > 1 ? ' warnings.' : ' warning.';
    }
    msg += ` So ${this.errors ? 'very ' : ''}sad!`;
    println(bold(msg));
  };
}

export default function Logger({
  target = toolName,
  println = console.error,
  volume = 0,
} = {}) {
  for (const level of keysOf(levels)) {
    const descriptor = levels[level];

    if (volume < descriptor.volume) {
      defineProperty(this, level, { configurable, value: () => {} });
    } else {
      defineProperty(this, level, {
        configurable,
        value: createLogFunction(level, { target, println }),
      });
    }

    defineProperty(this, level + 's', {
      configurable,
      writable,
      value: 0,
    });
  }

  defineProperty(this, 'signOff', {
    configurable,
    value: createSignOff({ target, println }),
  });
}
