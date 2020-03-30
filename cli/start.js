#!/usr/bin/env node

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __directory = dirname(fileURLToPath(import.meta.url));
const loader = join(__directory, 'loader.js');
const main = join(__directory, 'main.js');
const LOADER_HOOK = '@grr/siteforge/loader/hook';

function runWithLoader() {
  // Node doesn't support installing a custom module loader at runtime. So we
  // have to spawn another node process, with this process forwarding I/O and
  // signals like foreground-child (https://github.com/tapjs/foreground-child/).
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
