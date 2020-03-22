/* © 2020 Robert Grimm */

import {
  assemblePage,
  build,
  copyAsset,
  extractCopyrightNotice,
  extractFrontMatter,
  minifyScript,
  minifyStyle,
  pipe,
  prefixCopyrightNotice,
  readSource,
  writeTarget,
} from './transform.js';

import { KIND } from '@grr/inventory/path';

// -----------------------------------------------------------------------------

export const preparePage = pipe(readSource, extractFrontMatter);

export const renderPage = pipe(assemblePage, writeTarget);

// -----------------------------------------------------------------------------

const buildClientScript = build(
  'script',
  readSource,
  extractCopyrightNotice,
  minifyScript,
  prefixCopyrightNotice,
  writeTarget
);

const buildStyle = build(
  'style',
  readSource,
  extractCopyrightNotice,
  minifyStyle,
  prefixCopyrightNotice,
  writeTarget
);

const copyResource = build('asset', copyAsset);

export function prebuilderFor(kind) {
  return {
    [KIND.MARKUP]: preparePage,
  }[kind];
}

export function builderFor(kind) {
  return {
    [KIND.CONFIG]: copyResource,
    [KIND.FONT]: copyResource,
    [KIND.GRAPHIC]: copyResource,
    [KIND.IMAGE]: copyResource,
    [KIND.MARKUP]: renderPage,
    [KIND.SCRIPT]: buildClientScript,
    [KIND.STYLE]: buildStyle,
  }[kind];
}
