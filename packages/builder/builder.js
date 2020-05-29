/* © 2020 Robert Grimm */

import {
  assemblePage,
  copyAsset,
  extractCopyrightNotice,
  extractFrontMatter,
  indexByKeywords,
  minifyScript,
  minifyStyle,
  prefixCopyrightNotice,
  readSource,
  toBuilder,
  writeTarget,
} from './transform.js';

import { Kind } from '@grr/inventory/kind';

// -----------------------------------------------------------------------------

const copyResource = toBuilder(copyAsset);

const buildClientScript = toBuilder(
  readSource,
  extractCopyrightNotice,
  minifyScript,
  prefixCopyrightNotice,
  writeTarget
);

const buildStyle = toBuilder(
  readSource,
  extractCopyrightNotice,
  minifyStyle,
  prefixCopyrightNotice,
  writeTarget
);

const preparePage = toBuilder(readSource, extractFrontMatter, indexByKeywords);

const finishPage = toBuilder(assemblePage, writeTarget);

export function builderFor(kind) {
  return {
    [Kind.Config]: copyResource,
    [Kind.Font]: copyResource,
    [Kind.Graphic]: copyResource,
    [Kind.Image]: copyResource,
    [Kind.Markup]: preparePage,
    [Kind.Script]: buildClientScript,
    [Kind.Style]: buildStyle,
  }[kind];
}

export function finisherFor(kind) {
  return {
    [Kind.Markup]: finishPage,
  }[kind];
}

// -----------------------------------------------------------------------------

const doBuild = (label, builder, file, context) => {
  const { executor, logger } = context;

  if (builder) {
    const verb = label[0].toUpperCase() + label.slice(1);
    logger.info(`${verb}ing ${file.kind} "${file.path}"`);
    executor.run(builder, undefined, file, context).catch(reason => {
      logger.error(`Failed to ${label} "${file.path}"`, reason);
    });
  } else {
    logger.error(`No ${label}er for ${file.kind} "${file.path}"`);
  }
};

/**
 * The context object includes an `executor`, the `inventory`, a `logger`, the
 * `metrics`, and the `options`.
 */
export async function buildAll(context) {
  const { executor, inventory } = context;

  for (const [phase, label, selector] of [
    [1, 'build', builderFor],
    [2, 'finish', finisherFor],
  ]) {
    for (const file of inventory.byPhase(phase)) {
      doBuild(label, selector(file.kind), file, context);
    }

    // The poor man's version of structured concurrency or fork/join
    await executor.onIdle();
  }
}
