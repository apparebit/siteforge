/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { posix } from 'path';

const { extname, join, parse } = posix;
const { assign, create, freeze } = Object;

export const Kind = freeze(
  [
    'Config',
    'ComputedData',
    'ComputedMarkup',
    'ComputedStyle',
    'Document',
    'Font',
    'Graphic',
    'Image',
    'Markdown',
    'Markup',
    'Script',
    'Style',
    'Text',
    'Unknown',
  ].reduce((acc, label) => ((acc[label] = label), acc), create(null))
);

export const hasPhase = (kind, phase) => {
  assert(kind in Kind, 'kind must be defined');
  assert(phase === 1 || phase === 2, 'phase must be 1 or 2');

  if (phase === 1) {
    return true;
  } else {
    return kind === Kind.Markup;
  }
};

const Extension2Extension = freeze(
  assign(create(null), {
    '.htm': '.html',
    '.jpeg': '.jpg',
  })
);

export function toCanonicalExtension(extension) {
  return extension in Extension2Extension
    ? Extension2Extension[extension]
    : extension;
}

const Extension2Kind = freeze(
  assign(create(null), {
    '.css': Kind.Style,
    '.html': Kind.Markup,
    '.jpg': Kind.Image,
    '.md': Kind.Markdown,
    '.pdf': Kind.Document,
    '.png': Kind.Image,
    '.svg': Kind.Graphic,
    '.txt': Kind.Text,
    '.webmanifest': Kind.Config,
    '.webp': Kind.Image,
    '.woff': Kind.Font,
    '.woff2': Kind.Font,
  })
);

const IsKnownConfigPath = freeze({
  '/.htaccess': true,
  '/feed.rss': true,
  '/robots.txt': true,
  '/sitemap.xml': true,
});

export const isDefaultAssetPath = path => /^\/(assets?|static)\//iu.test(path);
export const toCoolPath = path => path.replace(/(\/index.html|.html|\/)$/u, '');

export const classify = (path, {
  isStaticAsset = isDefaultAssetPath,
  justCopy = () => false,
} = {}) => {
  if (IsKnownConfigPath[path] || justCopy(path)) {
    return { coolPath: path, kind: Kind.Config };
  }

  let { dir, name, ext } = parse(path);

  // Check for preferred extension.
  if (ext in Extension2Extension) {
    ext = Extension2Extension[ext];
    path = join(dir, name + ext);
  }

  // Check for non-JavaScript extension.
  if (ext !== '.js') {
    return {
      coolPath: toCoolPath(path),
      kind: Extension2Kind[ext] || Kind.Unknown,
    };
  }

  // Check the second extension.
  ext = extname(name);
  path = join(dir, name);

  if (ext === '.data') {
    return { coolPath: undefined, kind: Kind.ComputedData };
  } else if (ext === '.html') {
    return { coolPath: toCoolPath(path), kind: Kind.ComputedMarkup };
  } else if (ext === '.css') {
    return { coolPath: path, kind: Kind.ComputedStyle };
  } else if (isStaticAsset(path)) {
    return { coolPath: path, kind: Kind.Script };
  } else {
    return { coolPath: toCoolPath(path), kind: Kind.ComputedMarkup };
  }
};
