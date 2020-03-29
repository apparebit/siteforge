/* © 2019-2020 Robert Grimm */

import {
  copyFile,
  createWriteStream,
  injectIntoPath,
  isDotFile,
  isVersionedPath,
  pump,
  readFile,
  rmdir,
  toDirectory,
  unlink,
  withTrailingSlash,
  writeVersionedFile,
} from '@grr/fs';

import { createHash } from 'crypto';
import { h } from '@grr/proact/vdom';
import harness from './harness.js';
import { join } from 'path';
import Model from '@grr/html';
import { tmpdir } from 'os';
import { render } from '@grr/proact';

const APPAREBIT = 'https://apparebit.com';
const __directory = toDirectory(import.meta.url);
//const DOT = '.'.charCodeAt(0);

harness.test('@grr/fs', t => {
  const tmp = tmpdir();

  // ---------------------------------------------------------------------------
  t.test('paths', t => {
    // isDotFile()
    t.ok(isDotFile('.DS_Store'));
    t.notOk(isDotFile('index.html'));

    // withTrailingSlash()
    t.equal(withTrailingSlash(APPAREBIT).href, APPAREBIT + '/');
    t.equal(
      withTrailingSlash(APPAREBIT + '/slasher').href,
      APPAREBIT + '/slasher/'
    );
    t.equal(
      withTrailingSlash(APPAREBIT + '/slasher/').href,
      APPAREBIT + '/slasher/'
    );

    // toDirectory()
    t.notOk(__directory.startsWith('file:'));
    t.ok(__directory.endsWith('/test'));

    t.end();
  });

  // ---------------------------------------------------------------------------
  t.test('retryAfterNoEntity()', async t => {
    try {
      const from = join(__directory, 'index.js');
      const to1 = join(__directory, 'down/the/rabbit/hole/index.js');
      const to2 = join(__directory, 'down/the/rabbit/hole/copy.js');
      await copyFile(from, to1);

      const [original, copy1] = await Promise.all([
        readFile(from, 'utf8'),
        readFile(to1, 'utf8'),
      ]);
      t.equal(copy1, original);

      await copyFile(from, to2);
      const copy2 = await readFile(to2, 'utf8');
      t.equal(copy2, original);
    } finally {
      await rmdir(join(__directory, 'down'), { recursive: true });
    }

    t.end();
  });

  // ---------------------------------------------------------------------------
  t.test('versionPath(), writeVersionedPath()', async t => {
    const path = join(tmp, 'hello.txt');
    const vp = join(tmp, 'hello.v~d9014c46.txt');
    const data = 'Hello, world!\n';
    const hash =
      'd9014c4624844aa5bac314773d6b689ad467fa4e1d1a50a1b8a99d5a95f72ff5';

    t.equal(createHash('sha256').update(data).digest('hex'), hash);

    // Path injection.
    t.equal(
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
    t.equal(actual, vp);
    t.equal(await readFile(vp, 'utf8'), data);
    actual = await writeVersionedFile(path, data, 'utf8');
    t.equal(actual, vp);
    t.equal(await readFile(vp, 'utf8'), data);

    t.end();
  });

  // ---------------------------------------------------------------------------
  t.test('drain()', async t => {
    const theQuestion = h(
      'div',
      { class: 'highlight' },
      h('span', null, [
        null,
        undefined,
        true,
        false,
        'And the answer',
        null,
        false,
        ' is   ',
        [[[[42]]]],
        '!',
      ])
    );

    const answer = join(tmp, 'answer.txt');
    try {
      const model = await Model.load();
      (
        await pump(
          render(theQuestion, { model }),
          createWriteStream(answer, { highWaterMark: 8 })
        )
      ).end();

      t.equal(
        await readFile(answer, 'utf8'),
        '<div class=highlight><span>And the answer is 42!</span></div>'
      );
    } finally {
      try {
        await unlink(answer);
      } catch {
        // Ignore.
      }
    }

    t.end();
  });

  t.end();
});
