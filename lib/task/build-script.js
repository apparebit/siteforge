/* © 2019 Robert Grimm */

import babel from '@babel/core';
import { readFile, retryAfterNoEntity, writeFile } from '../tooling/fs.js';
import { extractRightsNotice, withRightsNotice } from '../tooling/text.js';
import { writeVersionedFile } from '../tooling/versioning.js';

export default async function script(from, to, vpath) {
  const original = await readFile(from);
  const notice = extractRightsNotice(original);
  const minified = await babel.transformAsync(original, {
    filename: from,
    presets: ['minify'],
    comments: false,
  });
  const annotated = withRightsNotice(minified.code, notice);

  if (vpath === '/sw.js') {
    // Don't version service worker. Also return path of newly written file.
    return retryAfterNoEntity(async path => {
      await writeFile(path, annotated);
      return path;
    }, to);
  } else {
    return writeVersionedFile(to, annotated);
  }
}
