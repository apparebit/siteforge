/* © 2020 Robert Grimm */

import {
  assemblePage,
  build,
  copyAsset,
  extractCopyrightNotice,
  extractFrontMatter,
  indexByKeywords,
  minifyScript,
  minifyStyle,
  prefixCopyrightNotice,
  readSource,
  writeTarget,
} from './transform.js';

import { KIND } from '@grr/inventory/path';

// -----------------------------------------------------------------------------

const copyResource = build(copyAsset);

const buildClientScript = build(
  readSource,
  extractCopyrightNotice,
  minifyScript,
  prefixCopyrightNotice,
  writeTarget
);

const buildStyle = build(
  readSource,
  extractCopyrightNotice,
  minifyStyle,
  prefixCopyrightNotice,
  writeTarget
);

const preparePage = build(readSource, extractFrontMatter, indexByKeywords);

const finishPage = build(assemblePage, writeTarget);

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
