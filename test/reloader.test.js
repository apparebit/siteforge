/* © 2019 Robert Grimm */

import config from '../source/reloader/config.js';
import tap from 'tap';

const { isArray } = Array;
const { getOwnPropertyDescriptor, defineProperty } = Object;

// pkgdir must be URL.
const pkgdir = (() => {
  const href = new URL('..', import.meta.url).href;
  return href + (href.endsWith('/') ? '' : '/');
})();
const testdir = pkgdir + 'test/';

let configTester;

// eslint-disable-next-line consistent-return
function testConfig(input, expected) {
  try {
    const output = config({
      env: { RELOADER_SCOPES: input },
      println: () => {},
      isPrintTTY: false,
      exit: () => {},
    });

    if (isArray(expected)) {
      configTester.strictSame(output.scopes, expected);
    } else if (expected) {
      configTester.fail(
        `config() yielded scopes "${output.scopes}" where exception expected`
      );
    } else {
      return output;
    }
  } catch (x) {
    if (isArray(expected)) {
      configTester.fail(`exception "${x.message}" thrown where none expected`);
    } else if (expected) {
      configTester.match(x.message, expected);
    } else {
      throw x;
    }
  }
}

// ===== debug() =====

tap.test('reloader/config -> { debug }', t => {
  // noop
  t.strictEqual(
    config({
      env: { RELOADER_SCOPES: 'test' },
      println: s => s,
      isPrintTTY: false,
      exit: () => {},
    }).debug('hello'),
    undefined
  );

  // plain
  t.strictEqual(
    config({
      env: { RELOADER_SCOPES: 'test', DEBUG: 'reloader' },
      println: s => s,
      isPrintTTY: false,
      exit: () => {},
    }).debug('hello'),
    '[reloader] hello'
  );

  // styled
  t.strictEqual(
    config({
      env: { RELOADER_SCOPES: 'test', DEBUG: 'reloader' },
      println: s => s,
      isPrintTTY: true,
      exit: () => {},
    }).debug('hello'),
    '\x1b[90m[reloader] hello\x1b[39m'
  );

  t.end();
});

// ===== epoch =====

tap.test('reloader/config -> { epoch }', t => {
  const { epoch } = config({ env: { RELOADER_SCOPES: 'test' } });
  t.strictEqual(
    global[Symbol.for('@grr/reloader/epoch/current')],
    epoch.current
  );
  t.strictEqual(global[Symbol.for('@grr/reloader/epoch/next')], epoch.next);
  t.strictEqual(epoch.current(), 0);
  t.strictEqual(epoch.next(), 1);
  t.strictEqual(epoch.current(), 1);
  t.end();
});

tap.test('reloader/config -> { scopes }', t => {
  configTester = t;

  try {
    // All the ways config() can fail.
    testConfig(undefined, `Environment variable RELOADER_SCOPES is missing`);
    testConfig(``, `Environment variable RELOADER_SCOPES is missing`);
    testConfig(`   `, `Environment variable RELOADER_SCOPES is missing`);
    testConfig(
      `"`,
      /^Environment variable RELOADER_SCOPES contains malformed JSON string/u
    );
    testConfig(
      `[`,
      /^Environment variable RELOADER_SCOPES contains malformed JSON array/u
    );
    testConfig(
      `[]`,
      `Environment variable RELOADER_SCOPES contains empty JSON array`
    );
    testConfig(
      `[null]`,
      `Environment variable RELOADER_SCOPES contains JSON array with non-string entries`
    );
    testConfig(
      'https://apparebit.com',
      `Environment variable RELOADER_SCOPES contains URL "https://apparebit.com" with scheme other than "file:"`
    );
    testConfig(
      'file://host:80',
      `Environment variable RELOADER_SCOPES contains malformed path or file URL "file://host:80"`
    );

    t.throws(() =>
      config({
        env: {},
        println: () => {},
        isPrintTTY: true,
        exit: () => {},
      })
    );

    // All the ways config() can name the same scope.
    testConfig(`test`, [testdir]);
    testConfig(`test/`, [testdir]);
    testConfig(`"test"`, [testdir]);
    testConfig(`["test"]`, [testdir]);
    testConfig(pkgdir.slice('file://'.length) + 'test', [testdir]);
    testConfig(testdir, [testdir]);
  } finally {
    configTester = undefined;
  }

  t.end();
});

async function loadResolveHook() {
  const DEBUG = getOwnPropertyDescriptor(process.env, 'DEBUG');
  const SCOPES = getOwnPropertyDescriptor(process.env, 'RELOADER_SCOPES');

  process.env.RELOADER_SCOPES = 'test';
  delete process.env.DEBUG;

  let mod;
  try {
    mod = await import('../lib/reloader/hook.js');
  } finally {
    if (DEBUG) {
      defineProperty(process.env, 'DEBUG', DEBUG);
    }
    if (!SCOPES) {
      delete process.env.RELOADER_SCOPES;
    } else {
      defineProperty(process.env, 'RELOADER_SCOPES', SCOPES);
    }
  }

  return mod.resolve;
}

tap.test('reloader/resolve', async t => {
  const resolve = await loadResolveHook();
  const modMain = pkgdir + 'main.js';
  const modHookPath = './lib/reloader/hook.js';
  const modHook = new URL(modHookPath, modMain).href;
  const modTestPath = './test/reloader.test.js';
  const modTest = import.meta.url;
  const defaultResolver = (specifier, parentModuleURL) => ({
    specifier,
    parentModuleURL,
    format: 'default',
  });

  t.strictSame(await resolve('fs', modMain, defaultResolver), {
    url: 'fs',
    format: 'builtin',
  });
  t.strictSame(await resolve('tap', modMain, defaultResolver), {
    specifier: 'tap',
    parentModuleURL: modMain,
    format: 'default',
  });
  t.strictSame(await resolve(modHookPath, modMain, defaultResolver), {
    specifier: modHook,
    parentModuleURL: modMain,
    format: 'default',
  });
  t.strictSame(await resolve(modTestPath, modMain, defaultResolver), {
    url: modTest + '#0',
    format: 'module',
  });
  t.strictSame(await resolve('./t2.js', modTest + '#665', defaultResolver), {
    url: new URL('./t2.js', modTest).href + '#665',
    format: 'module',
  });

  global[Symbol.for('@grr/reloader/epoch/next')]();
  t.strictSame(await resolve(modTestPath, modMain, defaultResolver), {
    url: modTest + '#1',
    format: 'module',
  });

  t.end();
});
