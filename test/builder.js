/* © 2019-2020 Robert Grimm */

import {
  copyAsset,
  extractFrontMatter,
  minifyScript,
  minifyStyle,
  extractProvenanceNotice,
  prefixProvenanceNotice,
  readSource,
  toBuilder,
  writeTarget,
} from '@grr/builder/transform';
import harness from './harness.js';
import { join } from 'path';
import { Kind } from '@grr/inventory/kind';
import { readFile, rm, toDirectory } from '@grr/fs';

const __directory = toDirectory(import.meta.url);
const { assign, keys: keysOf } = Object;

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
    await rm(buildDir, { recursive: true });
  }

  // Extract and Prefix Provenance Notice.
  let { provenance, content } = extractProvenanceNotice({
    content: '/*  (C) Copyright 2020 Robert Grimm  */\n<html>Faux Page</html>',
  });
  t.equal(provenance, '(C) Copyright 2020 Robert Grimm');
  t.equal(content, '<html>Faux Page</html>');

  t.equal(extractProvenanceNotice({ content: 'Boo!' }), undefined);

  ({ provenance, content } = prefixProvenanceNotice({ provenance, content }));
  t.equal(provenance, undefined);
  t.equal(
    content,
    '/* (C) Copyright 2020 Robert Grimm */\n<html>Faux Page</html>'
  );

  t.equal(prefixProvenanceNotice({ content: 'Boo!' }), undefined);

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
  ({ content } = await minifyScript(
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
  margin-bottom: 2em;
}`,
    },
    context
  ));
  t.equal(content, '.class{margin-bottom:2em;margin-top:1em}');

  t.end();
});
