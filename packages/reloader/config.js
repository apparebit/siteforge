/* © 2019 Robert Grimm */

import { EOL } from 'os';
import { format } from 'util';
import { pathToFileURL } from 'url';
import { resolve as resolvePath } from 'path';

const DOUBLE_QUOTE = '"'.charCodeAt(0);
const OPEN_BRACKET = '['.charCodeAt(0);
const { parse: parseJSON } = JSON;

export default function config({
  env = process.env,
  println = console.error,
  isPrintTTY = process.stderr.isTTY,
  exit = process.exit,
} = {}) {
  // Set up error reporting.
  const isOutputStylish = isPrintTTY && !env.NODE_DISABLE_COLORS;

  const fail = msg => {
    const inBoldRed = isOutputStylish ? s => `\x1b[1;31m${s}\x1b[0m` : s => s;
    const err = 'Error during initialization of the Reloader ESM resolve hook:';
    msg = 'Environment variable RELOADER_SCOPES ' + msg;

    // Print multi-line message in one call to avoid fragmentation.
    println(EOL + inBoldRed(err) + EOL + inBoldRed(msg + '.'));
    exit(78); // EX_CONFIG in FreeBSD sysexits(3)
    throw new Error(msg);
  };

  // Set up debug logging.
  const isDebugEnabled = (env.DEBUG || '').split(',').some(m => {
    m = m.trim();
    return m === 'reloader' || m === '@grr/reloader';
  });

  let debug;
  if (isDebugEnabled && isOutputStylish) {
    debug = (...args) =>
      println(`\x1b[90m[reloader] ${format(...args)}\x1b[39m`);
  } else if (isDebugEnabled) {
    debug = (...args) => println(`[reloader] ${format(...args)}`);
  } else {
    debug = () => {};
  }

  // Set up epoch counting.
  let epoch = 0;
  const current = () => epoch;
  const next = () => ++epoch;

  global[Symbol.for('@grr/reloader/epoch/current')] = current;
  global[Symbol.for('@grr/reloader/epoch/next')] = next;

  // Determine scopes.
  let scopes = env.RELOADER_SCOPES;
  if (scopes === undefined) {
    fail(`is missing`);
  }

  scopes = String(scopes).trim();
  if (scopes.length === 0) {
    fail(`is missing`);
  }

  switch (scopes.charCodeAt(0)) {
    case DOUBLE_QUOTE:
      try {
        scopes = [parseJSON(scopes)];
      } catch (x) {
        fail(`contains malformed JSON string (${x.message})`);
      }
      break;
    case OPEN_BRACKET:
      try {
        scopes = parseJSON(scopes);
      } catch (x) {
        fail(`contains malformed JSON array (${x.message})`);
      }
      if (scopes.length === 0) {
        fail(`contains empty JSON array`);
      } else if (!scopes.every(s => typeof s === 'string')) {
        fail(`contains JSON array with non-string entries`);
      }
      break;
    default:
      scopes = [scopes];
  }

  scopes = scopes.map(s => {
    if (/^(blob|data|ftp|https?|wss?):/u.test(s)) {
      fail(`contains URL "${s}" with scheme other than "file:"`);
    }

    let s1 = s;
    if (!s1.startsWith('file:')) {
      s1 = pathToFileURL(resolvePath(s)).href;
    }

    if (!s1.endsWith('/')) {
      s1 += '/';
    }

    try {
      s1 = new URL(s1).href;
    } catch (x) {
      fail(`contains malformed path or file URL "${s}"`);
    }
    return s1;
  });

  scopes.forEach((scope, index) =>
    debug(`scope ${index + 1}/${scopes.length} "${scope}"`)
  );

  // Done.
  return { debug, epoch: { current, next }, scopes };
}
