#!/usr/bin/env node

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __directory = dirname(fileURLToPath(import.meta.url));
const loader = join(__directory, 'loader.js');
const main = join(__directory, 'main.js');
const LOADER_HOOK = '@grr/siteforge/loader/hook';

function runWithLoader() {
  // A more targeted and hence much simpler version of foreground-child
  // (https://github.com/tapjs/foreground-child/blob/master/index.js)
  const { argv, argv0, cwd, execArgv } = process;

  const child = spawn(
    // Executable and most arguments are exactly the same as before, with the
    // critical difference being the activation of resolve module loader hook.
    argv0,
    [...execArgv, '--experimental-loader', loader, main, ...argv.slice(2)],
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
