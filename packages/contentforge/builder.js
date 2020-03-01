/* © 2020 Robert Grimm */

import {
  copyAsset,
  extractCopyrightNotice,
  loadModule,
  log,
  minifyScript,
  minifyStyle,
  pipe,
  prefixCopyrightNotice,
  readSource,
  renderVDOM,
  runModule,
  writeTarget,
} from './transform.js';

import { KIND } from '@grr/inventory/path';

// -----------------------------------------------------------------------------

export const buildPage = pipe(
  log('info', file => `Building page "${file.path}"`),
  readSource,
  writeTarget
);

export const buildClientScript = pipe(
  log('info', file => `Minifying script "${file.path}"`),
  readSource,
  extractCopyrightNotice,
  minifyScript,
  prefixCopyrightNotice,
  writeTarget
);

export const buildServerScript = pipe(
  log('info', file => `Executing script "${file.path}"`),
  loadModule,
  runModule,
  renderVDOM,
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
  log('info', file => `Copying ${file.kind || 'file'} "${file.path}"`),
  copyAsset
);

// -----------------------------------------------------------------------------

export default function selectBuilderFor(kind) {
  return {
    [KIND.CONTENT_SCRIPT]: buildServerScript,
    [KIND.FONT]: copyResource,
    [KIND.GRAPHIC]: copyResource,
    [KIND.IMAGE]: copyResource,
    [KIND.MARKUP]: buildPage,
    [KIND.METADATA]: copyResource,
    [KIND.SCRIPT]: buildClientScript,
    [KIND.STYLE]: buildStyle,
  }[kind];
}
