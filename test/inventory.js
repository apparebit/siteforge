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

  '/about/apparebit.html': `<script>{
    name: 'About This Website',
    url: 'https://apparebit.com/about/apparebit',
  }</script><p>This is v3 of Apparebit.</p>`,
};

const MANIFEST_PREFIX = `{
  "private": true,
  "repository": "https://github.com/apparebit/siteforge",
  "author": "Robert Grimm (https://apparebit.com)",
  `;

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
  t.equal(apparebitDotHtml.toString(), 'File(/about/apparebit.html)');

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
  let metadata = indexDotHtml.extractFrontMatter();
  t.equal(metadata.name, 'Apparebit');
  t.equal(metadata.alternateName, 'It Will Appear');
  t.equal(metadata.url, 'https://apparebit.com');
  t.equal(indexDotHtml.content, '<p>Welcome to Apparebit!</p>');

  // No or malformed front matter.
  indexDotHtml.content = '';
  t.equal(indexDotHtml.extractFrontMatter(), undefined);

  indexDotHtml.content = '<script>...';
  t.throws(() => indexDotHtml.extractFrontMatter());

  indexDotHtml.content = `<script>665</script>Whatever!`;
  t.throws(() => indexDotHtml.extractFrontMatter());

  const file = inventory.addFile('/file', {
    source: resolve(DIRECTORY, '../package.json'),
  });

  let data = await file.read();
  t.equal(typeof data, 'string');
  t.ok(data.startsWith(MANIFEST_PREFIX));
  t.equal(file.content, data);

  file.encoding = 'utf8';
  data = await file.read();
  t.equal(typeof data, 'string');
  t.ok(data.startsWith(MANIFEST_PREFIX));

  file.encoding = 'json';
  data = await file.read();
  t.ok(data);
  t.equal(typeof data, 'object');
  t.equal(data.repository, 'https://github.com/apparebit/siteforge');
  t.equal(data.author, 'Robert Grimm (https://apparebit.com)');
  t.equal(file.content, data);

  const d2 = await file.read();
  t.strictSame(d2, data);

  t.end();
});
