/* © 2019 Robert Grimm */

import babel from '@babel/core';
import { readFile, retryAfterNoEnt, writeFile } from '../tooling/fs.js';
import { withRightsNotice } from '../tooling/text.js';
import { writeVersionedFile } from '../tooling/versioning.js';

export default async function script(from, diff, to) {
  const original = await readFile(from);
  const minified = await babel.transformAsync(original, {
    filename: from,
    presets: ['minify'],
    comments: false,
  });
  const annotated = withRightsNotice(minified);

  if (diff === 'sw.js') {
    // Don't version service worker!
    return retryAfterNoEnt(path => (writeFile(path, annotated), to), to);
  } else {
    return writeVersionedFile(to, annotated);
  }
}
