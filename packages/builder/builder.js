/* © 2020-2021 Robert Grimm */

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

import { debounce } from '@grr/oddjob/function';
import { Kind } from '@grr/inventory/kind';
import { watch } from 'chokidar';

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

function builderFor(kind) {
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

function contentBuilderFor(kind) {
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
    logger.trace(` • ${verb} ${file.kind} "${file.path}"`);
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
    logger.trace(`Run async build tasks:`);
    for (const file of inventory.byPhase(phase)) {
      doBuild(selector(file.kind), file, context);
    }

    // The poor man's version of structured concurrency or fork/join
    logger.trace(`Awaiting outstanding build tasks`);
    await executor.onIdle();
    logger.trace(`Done building`);
  }
}

// -----------------------------------------------------------------------------

/**
 * Rebuild the website using whenever its content or components changes. To
 * prevent thrashing as a result of too many and possibly overlapping rebuild
 * operations, this function debounces file system change events before
 * considering a rebuild and then prevents more than one on-going rebuild from
 * running. Nonetheless, it correctly captures all file system change evens
 * included in a build and passes that list to the `afterBuild` callback (which
 * may be asynchronous).
 */
export function rebuildOnDemand(context, { afterBuild = () => { } } = {}) {
  const { inventory, logger, options } = context;
  const { contentDir } = options;

  // Rebuild website, then run completion handler.
  let building = false;
  const rebuild = async changes => {
    if (building) return;
    building = true;

    let error;
    try {
      await buildAll(context);
    } catch (x) {
      error = x;
    }

    try {
      await afterBuild(error, changes);
    } finally {
      building = false;
    }
  };

  // Trigger rebuild, with trigger debounced and rebuild strictly consecutive.
  let changes = [];
  const triggerRebuild = debounce(async () => {
    const includedChanges = changes;
    changes = [];
    await rebuild(includedChanges);
  });

  // Set up file system watcher.
  // FIXME: What about componentDir, followSymlinks?
  const watcher = watch([contentDir], {
    followSymlinks: false,
    ignored: options.doNotBuild,
  });

  const prefix = contentDir.length - 1;
  watcher.on('all', (event, path) => {
    // Record event and apply to inventory
    path = path.slice(prefix);
    logger.trace(`File system monitor: ${event} "${path}"`);

    inventory.handleChange(event, path);
    changes.push({ event, path });
    if (!building) triggerRebuild();
  });

  // Return function to tear down watcher.
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await watcher.close();
  };

  return stop;
}
