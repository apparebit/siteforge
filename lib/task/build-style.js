/**
 * @module task/buildStyle
 * @copyright (C) 2019 Robert Grimm
 */

import cssnano from 'cssnano';
import { logger } from '../config.js';
import postcss from 'postcss';
import { readFile } from '../tooling/fs.js';
import { withRightsNotice } from '../tooling/text.js';
import { writeVersionedFile } from '../tooling/versioning.js';

const css = postcss([
  cssnano({
    preset: [
      'default',
      {
        svgo: false,
      },
    ],
  }),
]);

export function reportPostCSSWarning(warn) {
  let msg = '';
  if (warn.node && warn.node.type !== 'root') {
    msg += `${warn.node.source.start.line}:${warn.node.source.start.column}: `;
  }
  msg += warn.text;
  if (warn.plugin) {
    msg += ` [${warn.plugin}]`;
  }
  logger.warning(msg);
}

export default async function style(from, to) {
  // The content.
  const original = await readFile(from);
  const minified = await css.process(original, { from, to });
  minified.warnings().forEach(reportPostCSSWarning);
  const annotated = withRightsNotice(minified);

  // The file.
  return writeVersionedFile(to, annotated);
}
