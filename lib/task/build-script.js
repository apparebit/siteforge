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

  if (this.options.versionAssets && vpath !== '/sw.js') {
    return writeVersionedFile(to, annotated);
  } else {
    return retryAfterNoEntity(async path => {
      await writeFile(path, annotated);
      return path;
    }, to);
  }
}
