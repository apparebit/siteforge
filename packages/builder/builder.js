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

const copyResource = toBuilder('copy', copyAsset);

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

const preparePage = toBuilder(
  'prepare',
  readSource,
  extractFrontMatter,
  indexByKeywords
);

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

export function contentBuilderFor(kind) {
  return {
    [Kind.Markup]: finishPage,
  }[kind];
}

// -----------------------------------------------------------------------------

const doBuild = (builder, file, context) => {
  const { executor, logger } = context;

  if (builder) {
    const label = builder.verb;
    const verb = label[0].toUpperCase() + label.slice(1);
    logger.info(` • ${verb} ${file.kind} "${file.path}"`);
    executor.run(builder, undefined, file, context).catch(reason => {
      logger.error(`Failed to ${label} "${file.path}"`, reason);
    });
  } else {
    logger.error(`No builder for ${file.kind} "${file.path}"`);
  }
};

/**
 * The context object includes an `executor`, the `inventory`, a `logger`, the
 * `metrics`, and the `options`.
 */
export async function buildAll(context) {
  const { executor, inventory, logger } = context;

  for (const [phase, selector] of [
    [1, builderFor],
    [2, contentBuilderFor],
  ]) {
    logger.info(`Scheduling async tasks (fork)`);
    for (const file of inventory.byPhase(phase)) {
      doBuild(selector(file.kind), file, context);
    }

    // The poor man's version of structured concurrency or fork/join
    logger.info(`Awaiting outstanding async tasks (join)`);
    await executor.onIdle();
  }
}
