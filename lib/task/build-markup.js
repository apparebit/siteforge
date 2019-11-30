/* © 2019 Robert Grimm */

import { readFile, retryAfterNoEntity, writeFile } from '../tooling/fs.js';

export default async function buildMarkup(
  { from, to, vpath },
  changedPaths,
  renamedResources
) {
  this.logger.info(`Build page "${vpath}"`);
  const original = await readFile(from, 'utf8');
  const updated = original.replace(changedPaths, original => {
    const update = renamedResources.get(original);
    if (update) return update;

    this.logger.warning(`no replacement for path "${original}"`);
    return original;
  });
  return retryAfterNoEntity(path => writeFile(path, updated, 'utf8'), to);
}
