/* © 2019 Robert Grimm */

import { readFile, retryAfterNoEntity, writeFile } from '../tooling/fs.js';

export default async function buildMarkup(
  { from, diff, to },
  changedPaths,
  renamedResources
) {
  this.logger.info(`Build page "${diff}"`);
  const original = await readFile(from, 'utf8');
  const updated = original.replace(changedPaths, original =>
    renamedResources.get(original)
  );
  return retryAfterNoEntity(path => writeFile(path, updated, 'utf8'), to);
}
