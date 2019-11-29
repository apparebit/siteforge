/* © 2019 Robert Grimm */

import { dirname, join } from 'path';
import { readFile } from './fs.js';

const { parse: parseJSON } = JSON;

// Manifest cache mapping paths to { path, data } entries for already located
// and loaded manifests. Alternatively, an entry of false indicates that the
// path contains no manifest.
const cache = new Map();

export async function nearestManifest(start = process.cwd()) {
  let trace = [];
  let next = start;
  let current;

  while (current !== next) {
    current = next;
    trace.push(current);

    // Check cache.
    const entry = cache.get(current);
    if (entry) {
      return { ...entry };
    } else if (entry === false) {
      next = dirname(current);
      continue;
    }

    // Check file system.
    try {
      const path = join(current, 'package.json');
      const data = parseJSON(await readFile(path, 'utf8'));

      const entry = { path, data };
      cache.set(path, entry);
      trace.forEach(p => cache.set(p, entry));

      return { ...entry };
    } catch (x) {
      if (x.code !== 'ENOENT') {
        throw x;
      }
    }

    cache.set(current, false);
    next = dirname(current);
  }

  const err = new Error(`unable to locate "package.json" above "${start}"`);
  err.code = 'ENOENT';
  throw err;
}
