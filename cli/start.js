#!/usr/bin/env node

import { fileURL } from '@grr/loader';
import { spawn } from 'child_process';

const main = new URL('./main.js', import.meta.url);
const SIGNALS = ['SIGABRT', 'SIGALRM', 'SIGHUP', 'SIGINT', 'SIGTERM'];

function runWithLoader() {
  // Node doesn't support dynamic installation of a module loader. Instead, we
  // spawn another process, with this process forwarding I/O and signals similar
  // to [foreground-child](https://github.com/tapjs/foreground-child/). However,
  // in an attempt to eliminate cruft that may have accumulated in that package
  // over the years, we only forward signals shared between Windows, macOS, and
  // Linux according to [signal-exit]](https://github.com/tapjs/signal-exit).
  const { argv, argv0, cwd, execArgv } = process;

  const child = spawn(
    argv0,
    [
      ...execArgv,
      `--title=site:forge`,
      `--experimental-loader=${fileURL}`,
      main,
      ...argv.slice(2),
    ],
    {
      cwd: cwd(),
      stdio: 'inherit',
    }
  );

  const signalHangup = () => child.kill('SIGHUP');
  process.on('exit', signalHangup);

  for (const signal of SIGNALS) {
    const handler = () => child.kill(signal);
    process.on(signal, handler);
  }

  child.on('close', (code, signal) => {
    process.exitCode = signal ? 128 + signal : code;
  });
}

(async function start() {
  const status = await import('@grr/loader/status');
  if (status === 'no loader') {
    runWithLoader();
  } else {
    await import(main);
  }
})();
