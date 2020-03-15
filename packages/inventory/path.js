/* © 2020 Robert Grimm */

import { posix } from 'path';

const {
  extname: extnameUrlPath,
  join: joinUrlPath,
  parse: parseUrlPath,
} = posix;
const { assign, create, freeze } = Object;

export const KIND = freeze(
  assign(create(null), {
    CONFIG: 'config',
    CONTENT_SCRIPT: 'content-script', // Executed during website generation.
    DATA: 'data', // File objects.
    FONT: 'font',
    GRAPHIC: 'graphic', // Vector graphics.
    IMAGE: 'image', // Bitmapped image.
    MARKDOWN: 'markdown',
    MARKUP: 'markup', // HTML.
    SCRIPT: 'script', // Executed on client.
    STYLE: 'style',
    TEXT: 'text',
    UNKNOWN: 'file',
  })
);

export function isDefaultAssetPath(path) {
  return /^\/(assets?|static)\//iu.test(path);
}

export function toKind(path, isStaticAsset = isDefaultAssetPath) {
  if (path.endsWith('/.htaccess') || path.endsWith('/robots.txt')) {
    return KIND.CONFIG;
  }

  const { name, ext } = parseUrlPath(path);
  if (ext !== '.js') {
    return (
      {
        '.css': KIND.STYLE,
        '.htm': KIND.MARKUP,
        '.html': KIND.MARKUP,
        '.jpg': KIND.IMAGE,
        '.jpeg': KIND.IMAGE,
        '.md': KIND.MARKDOWN,
        '.png': KIND.IMAGE,
        '.svg': KIND.GRAPHIC,
        '.txt': KIND.TEXT,
        '.webmanifest': KIND.CONFIG,
        '.webp': KIND.IMAGE,
        '.woff': KIND.FONT,
        '.woff2': KIND.FONT,
      }[ext] || KIND.UNKNOWN
    );
  }

  const ext2 = extnameUrlPath(name);
  // A data-producing component for server-side execution.
  if (ext2 === '.data') return KIND.DATA;

  // We still need to distinguish content-producing scripts for server-side
  // execution from scripts for client-side execution. While the use of a second
  // extension for data-producing server-scripts generalizes, it is a bit heavy
  // on protocol. Instead, we leverage existing convention that reserves certain
  // directories for client assets and otherwise default to server scripts.
  return isStaticAsset(path) ? KIND.SCRIPT : KIND.CONTENT_SCRIPT;
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
