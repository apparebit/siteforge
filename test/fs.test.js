/* © 2019 Robert Grimm */

import {
  copyFile,
  injectIntoPath,
  isDotFile,
  isVersionedPath,
  readFile,
  rmdir,
  toCoolPath,
  toDirectory,
  withTrailingSlash,
  writeVersionedFile,
} from '@grr/fs';

import { join } from 'path';
import { createHash } from 'crypto';
import tap from 'tap';
import { tmpdir } from 'os';

const APPAREBIT = 'https://apparebit.com';
const __directory = toDirectory(import.meta.url);
//const DOT = '.'.charCodeAt(0);

tap.test('@grr/fs', t => {
  // ---------------------------------------------------------------------------
  t.test('paths', t => {
    // isDotFile()
    t.ok(isDotFile('.DS_Store'));
    t.notOk(isDotFile('index.html'));

    // withTrailingSlash()
    t.strictEqual(withTrailingSlash(APPAREBIT).href, APPAREBIT + '/');
    t.strictEqual(
      withTrailingSlash(APPAREBIT + '/slasher').href,
      APPAREBIT + '/slasher/'
    );
    t.strictEqual(
      withTrailingSlash(APPAREBIT + '/slasher/').href,
      APPAREBIT + '/slasher/'
    );

    // toDirectory()
    t.notOk(__directory.startsWith('file:'));
    t.ok(__directory.endsWith('/test'));

    // toCoolPath()
    t.strictEqual(
      toCoolPath('/features/ubu-trump/index.html'),
      '/features/ubu-trump'
    );
    t.strictEqual(
      toCoolPath('/features/ubu-trump/about.html'),
      '/features/ubu-trump/about'
    );
    t.strictEqual(
      toCoolPath('/features/ubu-trump/the-dark-tower.jpg'),
      '/features/ubu-trump/the-dark-tower.jpg'
    );
    t.strictEqual(toCoolPath('/features/ubu-trump/'), '/features/ubu-trump');

    t.end();
  });

  // ---------------------------------------------------------------------------
  t.test('retryAfterNoEntity()', async t => {
    try {
      const from = join(__directory, 'index.js');
      const to1 = join(__directory, 'down/the/rabbit/hole/index.js');
      const to2 = join(__directory, 'down/the/rabbit/hole/copy.js');
      await copyFile(from, to1);

      const original = await readFile(from, 'utf8');
      const copy1 = await readFile(to1, 'utf8');
      t.strictEqual(copy1, original);

      await copyFile(from, to2);
      const copy2 = await readFile(to2, 'utf8');
      t.strictEqual(copy2, original);
    } finally {
      await rmdir(join(__directory, 'down'), { recursive: true });
    }

    t.end();
  });

  // ---------------------------------------------------------------------------
  t.test('versionPath(), writeVersionedPath()', async t => {
    const tmp = tmpdir();
    const path = join(tmp, 'hello.txt');
    const vp = join(tmp, 'hello.v~d9014c46.txt');
    const data = 'Hello, world!\n';
    const hash =
      'd9014c4624844aa5bac314773d6b689ad467fa4e1d1a50a1b8a99d5a95f72ff5';

    t.strictEqual(
      createHash('sha256')
        .update(data)
        .digest('hex'),
      hash
    );

    // Path injection.
    t.strictEqual(
      injectIntoPath(path, '789abcdef'),
      join(tmp, 'hello.v~789abcde.txt')
    );

    // Testing for versioned paths.
    t.notOk(isVersionedPath(path));
    t.ok(isVersionedPath(vp));

    // Versioned file.
    t.throws(
      () => writeVersionedFile(path, data, 665),
      /Options argument must be a string or object/u
    );
    let actual = await writeVersionedFile(path, data);
    t.strictEqual(actual, vp);
    t.strictEqual(await readFile(vp, 'utf8'), data);
    actual = await writeVersionedFile(path, data, 'utf8');
    t.strictEqual(actual, vp);
    t.strictEqual(await readFile(vp, 'utf8'), data);

    t.end();
  });

  t.end();
});
