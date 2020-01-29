/* © 2019-2020 Robert Grimm */

import Inventory from '@grr/inventory';
import harness from './harness.js';
import { resolve } from 'path';
import { toDirectory } from '@grr/fs';

const DIRECTORY = toDirectory(import.meta.url);
const { entries } = Object;
const FAUX = {
  '/index.html': `<script>({
    name: 'Apparebit',
    alternateName: 'It Will Appear',
    url: 'https://apparebit.com',
  })</script><p>Welcome to Apparebit!</p>`,
  '/about/apparebit.html': `<script>({
    name: 'About This Website',
    url: 'https://apparebit.com/about/apparebit',
  })</script><p>This is v3 of Apparebit.</p>`,
};

harness.test('@grr/inventory', async t => {
  const inventory = Inventory.create();
  for (const [path, content] of entries(FAUX)) {
    inventory.addFile(path, { content });
  }

  let indexDotHtml = inventory.lookup('/index.html');
  t.equal(indexDotHtml.path, '/index.html');
  t.equal(indexDotHtml.extension, '.html');
  t.equal(indexDotHtml.kind, 'markup');

  const apparebitDotHtml = inventory.lookup('/about/apparebit.html');
  t.equal(apparebitDotHtml.path, '/about/apparebit.html');
  t.equal(apparebitDotHtml.extension, '.html');
  t.equal(apparebitDotHtml.kind, 'markup');

  t.equal(inventory.root.lookup('index.html'), indexDotHtml);
  let dir = inventory.root.lookup('.');
  t.equal(dir.path, '/');
  t.equal(
    inventory.root.lookup('about').lookup('apparebit.html'),
    apparebitDotHtml
  );

  // Error conditions for lookup and file creation.
  t.throws(() => inventory.lookup('/index.html/index.html'));
  t.throws(() => inventory.lookup('/file-really-does-not-exist'));
  t.throws(() =>
    inventory.lookup('/about/apparebit.html', { validateLastSegment: true })
  );
  t.throws(() => inventory.addFile('/index.html'));

  // Well-formed front matter.
  let { metadata } = indexDotHtml.frontMatter();
  t.equal(metadata.name, 'Apparebit');
  t.equal(metadata.alternateName, 'It Will Appear');
  t.equal(metadata.url, 'https://apparebit.com');
  t.equal(indexDotHtml.content, '<p>Welcome to Apparebit!</p>');

  // No or malformed front matter.
  await indexDotHtml.process(_ => '');
  t.equal(indexDotHtml.frontMatter().metadata, undefined);
  await indexDotHtml.process(_ => '<script>...');
  t.throws(() => indexDotHtml.frontMatter());
  await indexDotHtml.process(_ => `<script>665</script>Whatever!`);
  t.throws(() => indexDotHtml.frontMatter());

  const file = inventory.addFile('/file', {
    source: resolve(DIRECTORY, '../package.json'),
  });

  t.ok(
    (await file.read()).startsWith(`{
  "private": true,
  "repository": "https://github.com/apparebit/siteforge",
  "author": "Robert Grimm (https://apparebit.com)",
  `)
  );

  const data = await file.read('json');
  t.equal(data.repository, 'https://github.com/apparebit/siteforge');
  t.equal(data.author, 'Robert Grimm (https://apparebit.com)');

  const d2 = await file.read({ encoding: 'json' });
  t.strictSame(d2, data);

  t.end();
});
