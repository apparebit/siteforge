/* © 2019 Robert Grimm */

import minify from 'babel-minify';
import { readFile, retryAfterNoEntity, writeFile } from '../tooling/fs.js';
import { extractRightsNotice, withRightsNotice } from '../tooling/text.js';
import { writeVersionedFile } from '../tooling/versioning.js';

export default async function script(from, to, vpath) {
  const original = await readFile(from);
  const notice = extractRightsNotice(original);
  const minified = minify(original, {}, { comments: false });
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