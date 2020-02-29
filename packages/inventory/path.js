/* © 2020 Robert Grimm */

import { posix } from 'path';

const {
  extname: extnameUrlPath,
  join: joinUrlPath,
  parse: parseUrlPath,
} = posix;

export function kind(path) {
  if (path === '/.htaccess' || path === '.htaccess') {
    return 'config';
  }

  const { name, ext } = parseUrlPath(path);
  if (ext !== '.js') {
    return {
      '.css': 'style',
      '.htm': 'markup',
      '.html': 'markup',
      '.jpg': 'image',
      '.jpeg': 'image',
      '.md': 'markdown',
      '.png': 'image',
      '.svg': 'graphic',
      '.txt': 'config', // robots.txt
      '.webmanifest': 'config',
      '.webp': 'image',
      '.woff': 'font',
      '.woff2': 'font',
    }[ext];
  }

  const ext2 = extnameUrlPath(name);
  // A data-producing component for server-side execution.
  if (ext2 === '.data') return 'data';

  // We still need to distinguish content-producing components for server-side
  // execution from scripts for client-side execution. While the use of a second
  // extension generalizes, it seems a bit heavy on the protocol. Instead, we
  // leverage existing convention that reserves certain directories for client
  // assets and otherwise default to server components.
  return /^\/(assets?|library|js)\/.*?[.]js$/iu.test(path)
    ? 'script'
    : 'component';
}

export function cool(path) {
  const { dir, base, name, ext } = parseUrlPath(path);
  if (ext === '.html' || ext === '.htm') {
    if (name === 'index') {
      return dir;
    } else {
      return joinUrlPath(dir, name);
    }
  }
  return joinUrlPath(dir, base);
}
