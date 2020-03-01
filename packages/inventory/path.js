/* © 2020 Robert Grimm */

import { posix } from 'path';

const {
  extname: extnameUrlPath,
  join: joinUrlPath,
  parse: parseUrlPath,
} = posix;
const { freeze } = Object;

export const KIND = freeze({
  CONTENT_SCRIPT: 'content-script', // Executed during website generation.
  DATA: 'data', // File objects.
  FONT: 'font',
  GRAPHIC: 'graphic', // Vector graphics.
  IMAGE: 'image', // Bitmapped image.
  MARKDOWN: 'markdown',
  MARKUP: 'markup', // HTML.
  METADATA: 'metadata', // Configuration state.
  SCRIPT: 'script', // Executed on client.
  STYLE: 'style',
});

export function toKind(path) {
  if (path === '/.htaccess' || path === '.htaccess') {
    return KIND.METADATA;
  }

  const { name, ext } = parseUrlPath(path);
  if (ext !== '.js') {
    return {
      '.css': KIND.STYLE,
      '.htm': KIND.MARKUP,
      '.html': KIND.MARKUP,
      '.jpg': KIND.IMAGE,
      '.jpeg': KIND.IMAGE,
      '.md': KIND.MARKDOWN,
      '.png': KIND.IMAGE,
      '.svg': KIND.GRAPHIC,
      '.txt': KIND.METADATA, // robots.txt
      '.webmanifest': KIND.METADATA,
      '.webp': KIND.IMAGE,
      '.woff': KIND.FONT,
      '.woff2': KIND.FONT,
    }[ext];
  }

  const ext2 = extnameUrlPath(name);
  // A data-producing component for server-side execution.
  if (ext2 === '.data') return KIND.DATA;

  // We still need to distinguish content-producing scripts for server-side
  // execution from scripts for client-side execution. While the use of a second
  // extension for data-producing server-scripts generalizes, it is a bit heavy
  // on protocol. Instead, we leverage existing convention that reserves certain
  // directories for client assets and otherwise default to server scripts.
  return /^\/(assets?|library|js)\/.*?[.]js$/iu.test(path)
    ? KIND.SCRIPT
    : KIND.CONTENT_SCRIPT;
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
