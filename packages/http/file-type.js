/* © 2020 Robert Grimm */

import { extname } from 'path';

const { create, keys: keysOf } = Object;
const { isArray } = Array;

const REGISTRY = (() => {
  const data = {
    'application/atom+xml': 'atom',
    'application/geo+json': 'geojson',
    'application/json': 'json',
    'application/ld+json': 'jsonld',
    'application/manifest+json': 'webmanifest',
    'application/pdf': 'pdf',
    'application/rdf+xml': 'rdf',
    'application/rss+xml': 'rss',
    'application/wasm': 'wasm',
    'application/zip': 'zip',
    'audio/flac': 'flac',
    'audio/mp4': ['f4a', 'f4b', 'm4a'],
    'audio/mpeg': 'mp3',
    'audio/wave': ['wav', 'wave'],
    'font/otf': 'otf',
    'font/ttf': 'ttf',
    'font/woff': 'woff',
    'font/woff2': 'woff2',
    'image/bmp': 'bmp',
    'image/gif': 'gif',
    'image/jpeg': ['jfif', 'jpg', 'jpeg'],
    'image/png': 'png',
    'image/svg+xml': ['svg'], // svgz?
    'image/tiff': ['tif', 'tiff'],
    'image/webp': 'webp',
    'image/x-icon': ['cur', 'ico'],
    'text/calendar': 'ics',
    'text/css': 'css',
    'text/html': ['htm', 'html'],
    'text/javascript': ['cjs', 'js', 'mjs'], // Per WhatWG
    'text/markdown': ['markdown', 'md'],
    'text/plain': 'txt',
    'text/vcard': ['vcard', 'vcf'],
    'video/mp4': ['f4v', 'f4p', 'm4v', 'mp4'],
    'video/quicktime': ['mov', 'qt'],
    'video/webm': 'webm',
  };

  const mapping = create(null);
  for (const mediaType of keysOf(data)) {
    let extensions = data[mediaType];
    if (!isArray(extensions)) extensions = [extensions];

    for (const extension of extensions) {
      // Prefix extension with period.
      mapping[`.${extension}`] = mediaType;
    }
  }
  return mapping;
})();

const mediaTypeForPath = path =>
  REGISTRY[extname(path)] ?? 'application/octet-stream';

export default mediaTypeForPath;
