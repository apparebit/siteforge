#!/usr/bin/env node

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __directory = dirname(fileURLToPath(import.meta.url));
const loader = join(__directory, 'loader.js');
const main = join(__directory, 'main.js');
const LOADER_HOOK = '@grr/siteforge/loader/hook';
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
      `--experimental-loader=${loader}`,
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

async function start() {
  if (global[LOADER_HOOK]) {
    await import(main);
  } else {
    runWithLoader();
  }
}

start();
