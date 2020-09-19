/* © 2019-2020 Robert Grimm */

import {
  copyAsset,
  createSnippetInjector,
  extractFrontMatter,
  minifyScript,
  minifyStyle,
  extractCopyrightNotice,
  prefixCopyrightNotice,
  readSource,
  toBuilder,
  writeTarget,
} from '@grr/builder/transform';
import harness from './harness.js';
import { join } from 'path';
import { Kind } from '@grr/inventory/kind';
import { pipeline as doPipeline } from 'stream';
import { promisify } from 'util';
import { readFile, rmdir, toDirectory } from '@grr/fs';

const __directory = toDirectory(import.meta.url);
const { assign, keys: keysOf } = Object;
const pipeline = promisify(doPipeline);

harness.test('@grr/builder', async t => {
  const buildDir = join(__directory, 'fixtures', 'build');
  const contentDir = join(__directory, 'fixtures', 'content');

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
  try {
    let file = { path: '/la-flor.html', kind: Kind.Text };

    file = assign(
      file,
      await toBuilder(
        readSource,
        file => {
          t.equal(
            file.content,
            '<!DOCTYPE html><title>La Flor</title><p>De Mi Secreto</p>\n'
          );
          return undefined; // Nothing changed.
        },
        writeTarget
      )(file, context)
    );

    t.same(keysOf(file).sort(), [
      'content',
      'kind',
      'path',
      'source',
      'target',
    ]);
    t.equal(file.path, '/la-flor.html');
    t.equal(file.kind, Kind.Text);
    t.equal(file.content, undefined);
    t.equal(file.source, join(contentDir, '/la-flor.html'));
    t.equal(file.target, join(buildDir, '/la-flor.html'));
    t.equal(
      await readFile(join(buildDir, '/la-flor.html'), 'utf8'),
      '<!DOCTYPE html><title>La Flor</title><p>De Mi Secreto</p>\n'
    );
    t.same(trace, [{ type: 'timer', path: '/la-flor.html' }]);
    // t.same(logged, [['info', 'Building text "/la-flor.txt"']]);

    file = await copyAsset({ path: '/amanda-gris.css' }, context);
    t.equal(file.source, join(contentDir, '/amanda-gris.css'));
    t.equal(file.target, join(buildDir, '/amanda-gris.css'));
    t.equal(
      await readFile(join(buildDir, '/amanda-gris.css'), 'utf8'),
      `body::before {
  content: 'Leocadia Macías';
  content: 'Marisa Paredes';
}
`
    );
  } finally {
    await rmdir(buildDir, { recursive: true });
  }

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
  let file = {
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

  const rewrite = (snippet, ...fragments) => {
    function* source() {
      for (const fragment of fragments) {
        yield fragment;
      }
    }

    async function sink(fragments) {
      const result = [];
      for await (const fragment of fragments) {
        result.push(fragment);
      }
      return Promise.resolve(result.join(''));
    }

    const transform = createSnippetInjector(snippet);
    return pipeline(source, transform, sink);
  };

  t.is(
    await rewrite('waldo', '<!DOCTYPE html><html lang=en><body></body></html>'),
    '<!DOCTYPE html><html lang=en><body>waldo</body></html>'
  );

  t.is(
    await rewrite(
      'waldo',
      '<!DOCTYPE html>',
      '<html lang=en><body>',
      '</body></html>'
    ),
    '<!DOCTYPE html><html lang=en><body>waldo</body></html>'
  );

  t.is(
    await rewrite(
      'waldo',
      '<!DOCTYPE html>',
      '<html lang=en><body>',
      '</bo',
      'dy></html>'
    ),
    '<!DOCTYPE html><html lang=en><body>waldo</body></html>'
  );

  t.is(
    await rewrite('waldo', '<!DOCTYPE html>', '<html lang=en>', '</html>'),
    '<!DOCTYPE html><html lang=en>waldo</html>'
  );

  t.is(await rewrite('waldo', 'hello '), 'hello waldo');

  t.end();
});
