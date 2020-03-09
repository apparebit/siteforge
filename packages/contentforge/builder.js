/* © 2020 Robert Grimm */

import {
  assemblePage,
  build,
  copyAsset,
  extractCopyrightNotice,
  extractFrontMatter,
  loadModule,
  minifyScript,
  minifyStyle,
  //parseMarkup,
  prefixCopyrightNotice,
  readSource,
  renderToFile,
  runModule,
  writeTarget,
} from './transform.js';

import { KIND } from '@grr/inventory/path';

// -----------------------------------------------------------------------------

export const buildPage = build(
  'page',
  readSource,
  extractFrontMatter,
  //parseMarkup,
  assemblePage,
  //renderToFile
  writeTarget
);

// FIXME What is the equivalent of front matter?
export const buildServerScript = build(
  'scripted page',
  loadModule,
  runModule,
  assemblePage,
  renderToFile
);

export const buildClientScript = build(
  'script',
  readSource,
  extractCopyrightNotice,
  minifyScript,
  prefixCopyrightNotice,
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
