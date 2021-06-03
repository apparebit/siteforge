/* © 2019-2020 Robert Grimm */

import Inventory from '@grr/inventory';
import { classify, Kind } from '@grr/inventory/kind';
import harness from './harness.js';

const { entries, keys: keysOf } = Object;

const FAUX = {
  '/.htaccess': Kind.Config,
  '/about/apparebit.html': Kind.Markup,
  '/index.html': Kind.Markup,
  '/about/robert-grimm.js': Kind.ComputedMarkup,
  '/about/robert-grimm.jpg': Kind.Image,
  '/data/2020.data.js': Kind.ComputedData,
  '/features/utopia/sundown.jpg': Kind.Image,
  '/asset/function.js': Kind.Script,
  '/asset/logo.svg': Kind.Graphic,
  '/robots.txt': Kind.Config,
};

harness.test('@grr/inventory', t => {
  t.test('classify()', t => {
    t.same(classify('/features/ubu-trump/index.html'), {
      coolPath: '/features/ubu-trump',
      kind: 'Markup',
    });
    t.same(classify('/features/ubu-trump/about.html'), {
      coolPath: '/features/ubu-trump/about',
      kind: 'Markup',
    });
    t.same(classify('/features/ubu-trump/the-dark-tower.jpg'), {
      coolPath: '/features/ubu-trump/the-dark-tower.jpg',
      kind: 'Image',
    });
    t.same(classify('/features/ubu-trump/'), {
      coolPath: '/features/ubu-trump',
      kind: 'Unknown',
    });

    for (const [path, kind] of entries(FAUX)) {
      t.equal(classify(path).kind, kind);
    }

    t.same(classify('/a/b/f.booboo'), {
      coolPath: '/a/b/f.booboo',
      kind: Kind.Unknown,
    });

    t.end();
  });

  const inventory = new Inventory();
  const fauxPaths = keysOf(FAUX);

  t.test('toString(), Directory.toString()', t => {
    t.equal(inventory.toString().replace(/\s/gu, ''), '{"inventory":{"/":{}}}');
    t.equal(inventory.root.toString().replace(/\s/gu, ''), '{}');

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

    t.end();
  });

  t.test('add(), byPath(), Directory.lookup()', t => {
    for (const path of fauxPaths.slice(2)) {
      inventory.add(path);
    }

    t.equal(inventory.size, keysOf(FAUX).length);

    let ent = inventory.byPath('/');
    t.equal(ent.path, '/');
    t.equal(inventory.root, ent);

    ent = inventory.byPath('/index.html');
    t.equal(ent.path, '/index.html');
    t.equal(ent.kind, Kind.Markup);

    let ent2 = inventory.root.lookup('index.html');
    t.equal(ent2, ent);

    ent = inventory.root.lookup('.');
    t.equal(ent, inventory.root);
    ent = ent.lookup('..');
    t.equal(ent, inventory.root);
    ent = ent.lookup('features').lookup('utopia');
    t.equal(ent, inventory.byPath('/features/utopia'));

    t.end();
  });

  function checkPaths(t, fileIterator, paths) {
    t.same(
      [...fileIterator].map(f => f.path),
      paths
    );
  }

  t.test('Directory: entries(), files()', t => {
    checkPaths(t, inventory.root.entries(), [
      '/.htaccess',
      '/about',
      '/index.html',
      '/data',
      '/features',
      '/asset',
      '/robots.txt',
    ]);

    checkPaths(t, inventory.root.files(), [
      '/.htaccess',
      '/about/apparebit.html',
      '/about/robert-grimm.js',
      '/about/robert-grimm.jpg',
      '/index.html',
      '/data/2020.data.js',
      '/features/utopia/sundown.jpg',
      '/asset/function.js',
      '/asset/logo.svg',
      '/robots.txt',
    ]);

    t.end();
  });

  t.test('byKind(), byPhase()', t => {
    checkPaths(t, inventory.byKind(Kind.Graphic, Kind.Image), [
      '/asset/logo.svg',
      '/about/robert-grimm.jpg',
      '/features/utopia/sundown.jpg',
    ]);

    checkPaths(t, inventory.byPhase(1), [
      '/.htaccess',
      '/robots.txt',
      '/about/apparebit.html',
      '/index.html',
      '/about/robert-grimm.js',
      '/about/robert-grimm.jpg',
      '/features/utopia/sundown.jpg',
      '/data/2020.data.js',
      '/asset/function.js',
      '/asset/logo.svg',
    ]);
    checkPaths(t, inventory.byPhase(2), [
      '/about/apparebit.html',
      '/index.html',
    ]);

    const empty = new Inventory();
    t.same([...empty.byKind('.booboo')], []);
    t.same([...empty.byPhase(1)], []);
    t.same([...empty.byPhase(2)], []);

    t.end();
  });

  t.test('delete()', t => {
    // (1) Let's delete the logo from the inventory.
    const file = inventory.delete('/asset/logo.svg');

    // Check that deletion returned correct hierarchical entry.
    t.same(file.constructor.name, 'File');
    t.same(file.path, '/asset/logo.svg');

    // Check that file cannot be looked up by name anymore.
    t.throws(
      () => inventory.byPath('/asset/logo.svg'),
      /entry "logo.svg" in directory "\/asset" does not exist/u
    );

    // Check that file cannot be looked up by kind anymore.
    checkPaths(t, inventory.byKind(Kind.Graphic), []);

    // (2) Let's delete the remaining assets from the inventory.
    checkPaths(t, inventory.byKind(Kind.Script), ['/asset/function.js']);

    const dir = inventory.delete('/asset');

    t.same(dir.constructor.name, 'Directory');
    t.same(dir.path, '/asset');

    // Check that directory cannot be looked up by name anymore.
    t.throws(
      () => inventory.byPath('/asset'),
      /entry "asset" in directory "\/" does not exist/u
    );

    // Check that directory entries cannot be looked up by kind anymore.
    checkPaths(t, inventory.byKind(Kind.Script), []);
  });

  t.test('error conditions', t => {
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
    t.throws(() => [...inventory.byPhase(0)], /phase must be 1 or 2/u);

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

    t.end();
  });

  t.test('version(), versioned(), matchOriginals()', t => {
    // Versioned File Names
    inventory.version('/some/style.css', '/some/style-v~89abcdef.css');
    inventory.version('/some/style.css', '/some/style-v~89abcdef.css');
    t.throws(() =>
      inventory.version('/some/style.css', '/some/style-v~ffffffff.css')
    );

    t.equal(
      inventory.versioned('/some/style.css'),
      '/some/style-v~89abcdef.css'
    );
    t.equal(inventory.versioned('/some/other/style.css'), undefined);

    t.equal(inventory.matchOriginals().toString(), '/\\/some\\/style\\.css/u');

    t.end();
  });

  t.test('indexByKeywords(), keywords(), byKeyword()', t => {
    // Keywords.
    const files = [
      '/index.html',
      '/about/apparebit.html',
      '/about/robert-grimm.js',
    ].map(path => inventory.byPath(path));

    files[0].keywords = ['key', 'wórd'];
    files[1].keywords = ['keÿ', 'appear'];
    files[2].keywords = ['word'];
    files.forEach(file => inventory.indexByKeywords(file));

    t.same([...inventory.keywords()], ['key', 'word', 'appear']);

    const paths = index => index.files.map(file => file.path);

    let index = inventory.byKeyword('key');
    t.equal(index.keyword, 'key');
    t.same(index.display, ['key', 'keÿ']);
    t.same(paths(index), ['/index.html', '/about/apparebit.html']);

    index = inventory.byKeyword('wórd');
    t.equal(index.keyword, 'word');
    t.same(index.display, ['wórd', 'word']);
    t.same(paths(index), ['/index.html', '/about/robert-grimm.js']);

    index = inventory.byKeyword('appear');
    t.equal(index.keyword, 'appear');
    t.same(index.display, ['appear']);
    t.same(paths(index), ['/about/apparebit.html']);

    index = inventory.byKeyword('boo!');
    t.equal(index.keyword, 'boo');
    t.same(index.display, ['boo!']);
    t.same(index.files, []);

    t.end();
  });

  t.end();
});
