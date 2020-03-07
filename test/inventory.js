/* © 2019-2020 Robert Grimm */

import Inventory from '@grr/inventory';
import { cool, toKind, KIND } from '@grr/inventory/path';
import harness from './harness.js';

const { entries, keys: keysOf } = Object;

const FAUX = {
  '/.htaccess': KIND.CONFIG,
  '/about/apparebit.html': KIND.MARKUP,
  '/index.html': KIND.MARKUP,
  '/about/robert-grimm.js': KIND.CONTENT_SCRIPT,
  '/about/robert-grimm.jpg': KIND.IMAGE,
  '/data/2020.data.js': KIND.DATA,
  '/features/utopia/sundown.jpg': KIND.IMAGE,
  '/asset/function.js': KIND.SCRIPT,
  '/asset/logo.svg': KIND.GRAPHIC,
  '/robots.txt': KIND.CONFIG,
};

harness.test('@grr/inventory', t => {
  t.test('path', t => {
    t.is(cool('/features/ubu-trump/index.html'), '/features/ubu-trump');
    t.is(cool('/features/ubu-trump/about.html'), '/features/ubu-trump/about');
    t.is(
      cool('/features/ubu-trump/the-dark-tower.jpg'),
      '/features/ubu-trump/the-dark-tower.jpg'
    );
    t.is(cool('/features/ubu-trump/'), '/features/ubu-trump');

    for (const [path, kind] of entries(FAUX)) {
      t.is(toKind(path), kind);
    }

    t.end();
  });

  const inventory = new Inventory();
  t.equal(inventory.toString().replace(/\s/gu, ''), '{"inventory":{"/":{}}}');
  t.equal(inventory.root.toString().replace(/\s/gu, ''), '{}');

  const fauxPaths = keysOf(FAUX);
  inventory.add(fauxPaths[0]);
  t.equal(
    inventory.toString().replace(/\s+/gu, ' '),
    '{ "inventory": { "/": { ".htaccess": "File(config /.htaccess)" } } }'
  );

  inventory.add(fauxPaths[1]);
  t.equal(
    inventory.toString().replace(/\s+/gu, ' '),
    '{ "inventory": { "/": { ".htaccess": "File(config /.htaccess)", ' +
      '"about": { "apparebit.html": "File(markup /about/apparebit.html)" } } } }'
  );

  for (const path of fauxPaths.slice(2)) {
    inventory.add(path);
  }

  let ent = inventory.byPath('/');
  t.is(ent.path, '/');
  t.is(inventory.root, ent);

  ent = inventory.byPath('/index.html');
  t.is(ent.path, '/index.html');
  t.is(ent.kind, KIND.MARKUP);

  let ent2 = inventory.root.lookup('index.html');
  t.is(ent2, ent);

  ent = inventory.root.lookup('.');
  t.is(ent, inventory.root);
  ent = ent.lookup('..');
  t.is(ent, inventory.root);
  ent = ent.lookup('features').lookup('utopia');
  t.is(ent, inventory.byPath('/features/utopia'));

  function checkFileIndex(fileIterator, paths) {
    t.same(
      [...fileIterator].map(f => f.path),
      paths
    );
  }

  checkFileIndex(inventory.byKind(KIND.GRAPHIC, KIND.IMAGE), [
    '/asset/logo.svg',
    '/about/robert-grimm.jpg',
    '/features/utopia/sundown.jpg',
  ]);

  checkFileIndex(inventory.byPhase(1), ['/data/2020.data.js']);
  checkFileIndex(inventory.byPhase(2), [
    '/.htaccess',
    '/robots.txt',
    '/about/robert-grimm.jpg',
    '/features/utopia/sundown.jpg',
    '/asset/function.js',
    '/asset/logo.svg',
  ]);
  checkFileIndex(inventory.byPhase(3), [
    '/about/robert-grimm.js',
    '/about/apparebit.html',
    '/index.html',
  ]);

  // Error Conditions While Adding Files
  t.throws(() => inventory.add('about'), /path must be absolute/u);
  t.throws(
    () => inventory.root._add(665, 'boo'),
    /Don't call me, I'll call you!/u
  );
  t.throws(
    () => inventory.add('/index.html'),
    /directory "\/" already has entry "index.html"/u
  );

  // Error Conditions While Retrieving Files
  t.throws(() => inventory.byPath('about'), /path must be absolute/u);
  t.throws(() => [...inventory.byPhase(0)], /phase must be 1, 2, or 3/u);

  // Error Conditions During Directory Look Up
  t.throws(
    () => inventory.root.lookup('/index.html'),
    /path must be relative/u
  );
  t.throws(
    () => inventory.root.lookup('features/dystopia/index.html'),
    /entry "dystopia" in directory "\/features" does not exist/u
  );
  t.throws(() => {
    inventory.root.lookup('about/robert-grimm.js/index.html');
  }, /entry "robert-grimm.js" in directory "\/about" is not a directory/u);

  // Versioned File Names
  inventory.version('/some/style.css', '/some/style-v~89abcdef.css');
  inventory.version('/some/style.css', '/some/style-v~89abcdef.css');
  t.throws(() =>
    inventory.version('/some/style.css', '/some/style-v~ffffffff.css')
  );

  t.equal(inventory.versioned('/some/style.css'), '/some/style-v~89abcdef.css');
  t.equal(inventory.versioned('/some/other/style.css'), undefined);

  t.equal(inventory.matchOriginals().toString(), '/\\/some\\/style\\.css/u');

  t.end();
});
