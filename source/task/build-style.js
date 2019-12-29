/* © 2019 Robert Grimm */

import cssnano from 'cssnano';
import postcss from 'postcss';
import {
  readFile,
  retryAfterNoEntity,
  writeFile,
  writeVersionedFile,
} from '@grr/fs';
import { extractRightsNotice, withRightsNotice } from '../tooling/text.js';

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

export function reportPostCSSWarning(logger, warn) {
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
  const notice = extractRightsNotice(original);
  const minified = await css.process(original, { from, to });
  minified.warnings().forEach(warn => reportPostCSSWarning(this.logger, warn));
  const annotated = withRightsNotice(minified.css, notice);

  // The file.
  if (this.options.versionAssets) {
    return writeVersionedFile(to, annotated);
  } else {
    return retryAfterNoEntity(async path => {
      await writeFile(path, annotated);
      return path;
    }, to);
  }
}
