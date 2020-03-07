/* © 2020 Robert Grimm */

import {
  build,
  copyAsset,
  extractCopyrightNotice,
  loadModule,
  minifyScript,
  minifyStyle,
  parseHTML,
  prefixCopyrightNotice,
  readSource,
  renderHTML,
  runModule,
  writeTarget,
} from './transform.js';

import { KIND } from '@grr/inventory/path';

// -----------------------------------------------------------------------------

export const buildPage = build('page', readSource, parseHTML, writeTarget);

export const buildClientScript = build(
  'script',
  readSource,
  extractCopyrightNotice,
  minifyScript,
  prefixCopyrightNotice,
  writeTarget
);

export const buildServerScript = build(
  'scripted page',
  loadModule,
  runModule,
  renderHTML,
  writeTarget
);

export const buildStyle = build(
  'style',
  readSource,
  extractCopyrightNotice,
  minifyStyle,
  prefixCopyrightNotice,
  writeTarget
);

export const copyResource = build('asset', copyAsset);

// -----------------------------------------------------------------------------

export default function selectBuilderFor(kind) {
  return {
    [KIND.CONFIG]: copyResource,
    [KIND.CONTENT_SCRIPT]: buildServerScript,
    [KIND.FONT]: copyResource,
    [KIND.GRAPHIC]: copyResource,
    [KIND.IMAGE]: copyResource,
    [KIND.MARKUP]: buildPage,
    [KIND.SCRIPT]: buildClientScript,
    [KIND.STYLE]: buildStyle,
  }[kind];
}
