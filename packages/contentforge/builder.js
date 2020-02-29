/* © 2020 Robert Grimm */

import {
  copyAsset,
  extractCopyrightNotice,
  log,
  minifyScript,
  minifyStyle,
  pipe,
  prefixCopyrightNotice,
  readSource,
  writeTarget,
} from './transform.js';

// -----------------------------------------------------------------------------

export const buildPage = pipe(
  log('info', file => `Building page "${file.path}"`),
  readSource,
  writeTarget
);

export const buildScript = pipe(
  log('info', file => `Minifying script "${file.path}"`),
  readSource,
  extractCopyrightNotice,
  minifyScript,
  prefixCopyrightNotice,
  writeTarget
);

export const buildStyle = pipe(
  log('info', file => `Minifying style "${file.path}"`),
  readSource,
  extractCopyrightNotice,
  minifyStyle,
  prefixCopyrightNotice,
  writeTarget
);

export const copyResource = pipe(
  log('info', file => `Copying ${file.kind || 'file'} "${file.path}`),
  copyAsset
);

// -----------------------------------------------------------------------------

export default function builderFor(kind) {
  return {
    config: copyResource,
    font: copyResource,
    graphic: copyResource,
    image: copyResource,
    markup: buildPage,
    script: buildScript,
    style: buildStyle,
  }[kind];
}
