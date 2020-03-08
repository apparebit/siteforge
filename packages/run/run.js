/* © 2019 Robert Grimm */

import { execFile, spawn as doSpawn } from 'child_process';
import { promisify } from 'util';

const { create } = Object;
const doExecFile = promisify(execFile);

/**
 * Run the given command with the given arguments in a subprocess. The options
 * largely are the same as for Node's `child_process`, except that `stdio`
 * defaults to `inherit` and a value of `buffer` means capturing `stdout` and
 * `stderr`. This function returns a promise for completion of the command; it
 * resolves to an object when the command completes with exit code 0.
 *
 * @param {string} cmd - The command to run.
 * @param {string[]} args - The arguments for the command.
 * @param {Options} options - The options for the child process.
 * @returns {Promise<string[]>} A promise for an object, optionally containing
 * the captured output as `stdout` and `stderr`.
 */
export default function run(cmd, args = [], options = {}) {
  // Delegate to execFile() when capturing the output.
  if (options.stdio === 'buffer') {
    delete options.stdio;
    options.maxBuffer = options.maxBuffer || 1024 * 1024;
    options.encoding = options.encoding || 'utf8';
    return doExecFile(cmd, args, options);
  } else if (!options.stdio) {
    options.stdio = 'inherit';
  }

  // Otherwise, promisify spawn.
  let resolve,
    reject,
    promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

  let done = false;
  const sub = doSpawn(cmd, args, options);

  sub.on('error', err => {
    if (done) return;
    done = true;

    reject(err);
  });

  sub.on('exit', (code, signal) => {
    if (done) return;
    done = true;

    if (!code && !signal) {
      resolve(create(null));
    } else {
      let message = `Child process failed`;
      if (signal) {
        message += ` with signal "${signal}"`;
      } else {
        message += ` with exit code "${code}"`;
      }
      message += ` (${cmd} ${args
        .map(a => (a.includes(' ') ? `"${a}"` : a))
        .join(' ')})`;
      reject(new Error(message));
    }
  });

  return promise;
}
