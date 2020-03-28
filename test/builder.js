/* © 2019-2020 Robert Grimm */

import {
  build,
  copyAsset,
  extractFrontMatter,
  minifyScript,
  minifyStyle,
  extractCopyrightNotice,
  prefixCopyrightNotice,
  readSource,
  writeTarget,
} from '@grr/builder/transform';
import harness from './harness.js';
import { join } from 'path';
import { KIND } from '@grr/inventory/path';
import { tmpdir } from 'os';
import { mkdir, readFile, rmdir, writeFile } from '@grr/fs';

const { assign, keys: keysOf } = Object;

harness.test('@grr/builder', async t => {
  const tmp = tmpdir();
  const buildDir = join(tmp, 'build');
  const contentDir = join(tmp, 'content');
  t.comment(`Using "${contentDir}" for content`);
  t.comment(`Using "${buildDir}" for build`);

  const trace = [];
  const context = {
    options: {
      buildDir,
      contentDir,
      versionAssets: false,
    },
    logger: {
      info: message => trace.push({ type: 'log', level: 'info', message }),
      error: message => trace.push({ type: 'log', level: 'error', message }),
    },
    metrics: {
      timer() {
        return {
          start: path => () => trace.push({ type: 'timer', path }),
        };
      },
    },
  };

  // Read, Write
  let file = { path: '/la-flor.txt', kind: KIND.TEXT };
  await rmdir(buildDir, { recursive: true });
  await rmdir(contentDir, { recursive: true });
  await mkdir(buildDir);
  await mkdir(contentDir);
  await writeFile(join(contentDir, 'la-flor.txt'), 'de mi secreto', 'utf8');

  file = assign(
    file,
    await build(
      readSource,
      file => {
        t.equal(file.content, 'de mi secreto');
        return undefined; // Nothing changed.
      },
      writeTarget
    )(file, context)
  );

  t.same(keysOf(file).sort(), ['content', 'kind', 'path', 'source', 'target']);
  t.equal(file.path, '/la-flor.txt');
  t.equal(file.kind, KIND.TEXT);
  t.equal(file.content, undefined);
  t.equal(file.source, join(contentDir, '/la-flor.txt'));
  t.equal(file.target, join(buildDir, '/la-flor.txt'));
  t.equal(
    await readFile(join(buildDir, 'la-flor.txt'), 'utf8'),
    'de mi secreto'
  );
  t.same(trace, [{ type: 'timer', path: '/la-flor.txt' }]);
  // t.same(logged, [['info', 'Building text "/la-flor.txt"']]);

  await writeFile(join(contentDir, 'Amanda'), 'Gris', 'utf8');
  file = await copyAsset({ path: '/Amanda' }, context);

  t.equal(file.source, join(contentDir, '/Amanda'));
  t.equal(file.target, join(buildDir, '/Amanda'));
  t.equal(await readFile(join(buildDir, 'Amanda'), 'utf8'), 'Gris');

  // Extract and Prefix Copyright Notice.
  let { copyright, content } = extractCopyrightNotice({
    content: '// (C) Copyright 2020 Robert Grimm\n<html>Faux Page</html>',
  });
  t.equal(copyright, '(C) Copyright 2020 Robert Grimm');
  t.equal(content, '<html>Faux Page</html>');

  t.equal(extractCopyrightNotice({ content: 'Boo!' }), undefined);

  ({ copyright, content } = prefixCopyrightNotice({ copyright, content }));
  t.equal(copyright, undefined);
  t.equal(
    content,
    '/* (C) Copyright 2020 Robert Grimm */ <html>Faux Page</html>'
  );

  t.equal(prefixCopyrightNotice({ content: 'Boo!' }), undefined);

  // Extract Front Matter.
  file = {
    path: '/some/content',
    content: `<script>({
      name: 'Apparebit',
      alternateName: 'It Will Appear',
      url: 'https://apparebit.com',
    })</script><p>Welcome to Apparebit!</p>`,
  };

  let name, alternateName, url;
  ({ name, alternateName, url, content } = extractFrontMatter(file, context));
  t.equal(name, 'Apparebit');
  t.equal(alternateName, 'It Will Appear');
  t.equal(url, 'https://apparebit.com');
  t.equal(content, '<p>Welcome to Apparebit!</p>');

  // Fail at Extracting Front Matter.
  file.content = '';
  t.equal(extractFrontMatter(file, context), undefined);

  file.content = '<script>...';
  t.throws(
    () => extractFrontMatter(file, context),
    /front matter for "\/some\/content" has no closing tag/u
  );

  file.content = `<script>665</script>Whatever!`;
  t.throws(
    () => extractFrontMatter(file, context),
    /front matter for "\/some\/content" is not an object/u
  );

  // // Parse HTML.
  // ({ content } = parseMarkup({
  //   content: `<section><h2>Headline</h2><p>Paragraph</p></section>`,
  // }));
  // t.same(content, {
  //   type: 'section',
  //   children: [
  //     { type: 'h2', children: ['Headline'] },
  //     { type: 'p', children: ['Paragraph'] },
  //   ],
  // });

  // Minify Script.
  ({ content } = minifyScript(
    {
      content: `function hallo() {
  console.log("Yo!");
}`,
    },
    context
  ));
  t.equal(content, 'function hallo(){console.log("Yo!")}');

  // Minify Style.
  ({ content } = await minifyStyle(
    {
      path: '/some/content',
      content: `.class {
  margin-top: 1em;
  margin-bottom: 1em;
}`,
    },
    context
  ));
  t.equal(content, '.class{margin-top:1em;margin-bottom:1em}');

  t.end();
});
