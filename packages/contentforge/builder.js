/* © 2020 Robert Grimm */

import {
  assemblePage,
  build,
  copyAsset,
  extractCopyrightNotice,
  extractFrontMatter,
  minifyScript,
  minifyStyle,
  prefixCopyrightNotice,
  readSource,
  writeTarget,
} from './transform.js';

import { KIND } from '@grr/inventory/path';

// -----------------------------------------------------------------------------

const copyResource = build('asset', copyAsset);

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

const preparePage = build('pre-page', readSource, extractFrontMatter);
const finishPage = build('page', assemblePage, writeTarget);

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
    [KIND.MARKUP]: finishPage,
    [KIND.SCRIPT]: buildClientScript,
    [KIND.STYLE]: buildStyle,
  }[kind];
}
