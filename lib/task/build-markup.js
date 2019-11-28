/**
 * @module task/buildMarkup
 * @copyright (C) 2019 Robert Grimm
 */

import { readFile, retryAfterNoEnt, writeFile } from '../tooling/fs.js';

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
  return retryAfterNoEnt(path => writeFile(path, updated, 'utf8'), to);
}
