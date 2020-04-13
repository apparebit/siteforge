/* © 2020 Robert Grimm */

import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const { assign } = Object;
const { has } = Reflect;
const loaderPath = fileURLToPath(new URL('./loader.js', import.meta.url));
const LAUNCH = 'GRR_LOADER_LAUNCH';
const SIGNALS = ['SIGABRT', 'SIGALRM', 'SIGHUP', 'SIGINT', 'SIGTERM'];

// eslint-disable-next-line consistent-return
export default async function launch({
  fn = () => {},
  loader = loaderPath,
  module = process.argv[1],
  title = process.title,
} = {}) {
  const { argv, argv0, cwd, env, execArgv } = process;

  const { default: status } = await import('@grr/loader/status');
  if (status === '@grr/loader') {
    return fn();
  } else if (has(process.env, LAUNCH)) {
    throw new Error(`Process "${title}" is trying to launch itself again!`);
  }

  const child = spawn(
    argv0,
    [
      ...execArgv,
      `--title=${title}`,
      `--experimental-loader=${loader}`,
      module,
      ...argv.slice(2),
    ],
    {
      cwd: cwd(),
      env: assign({ [LAUNCH]: 'true' }, env),
      stdio: 'inherit',
    }
  );

  // Forward common signals to child.
  const handlers = {};
  for (const signal of SIGNALS) {
    const handler = (handlers[signal] = () => child.kill(signal));
    process.on(signal, handler);
  }
  process.on('exit', handlers.SIGHUP);

  // Forward exit code or signal name from child.
  child.on('close', (code, signal) => {
    process.exitCode = signal ? 128 + signal : code;
  });
}
