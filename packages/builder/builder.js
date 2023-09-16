/* © 2020-2021 Robert Grimm */

import {
  assemblePage,
  copyAsset,
  extractProvenanceNotice,
  extractFrontMatter,
  highlightSyntax,
  indexByKeywords,
  minifyScript,
  minifyStyle,
  prefixProvenanceNotice,
  readSource,
  toBuilder,
  writeTarget,
} from './transform.js';

import { debounce, RETRY } from '@grr/oddjob/function';
import { Kind } from '@grr/inventory/kind';
import { watch } from 'chokidar';

// -----------------------------------------------------------------------------

const copyResource = toBuilder('copy', copyAsset);

const buildClientScript = toBuilder(
  readSource,
  extractProvenanceNotice,
  minifyScript,
  prefixProvenanceNotice,
  writeTarget
);

const buildStyle = toBuilder(
  readSource,
  extractProvenanceNotice,
  minifyStyle,
  prefixProvenanceNotice,
  writeTarget
);

const preparePage = toBuilder(
  'prepare',
  readSource,
  extractFrontMatter,
  indexByKeywords,
  highlightSyntax,
);

const finishPage = toBuilder(assemblePage, writeTarget);

function phase1BuilderFor(kind) {
  return {
    [Kind.Config]: copyResource,
    [Kind.Document]: copyResource,
    [Kind.Font]: copyResource,
    [Kind.Graphic]: copyResource,
    [Kind.Image]: copyResource,
    [Kind.Markup]: preparePage,
    [Kind.Script]: buildClientScript,
    [Kind.Style]: buildStyle,
  }[kind];
}

function phase2BuilderFor(kind) {
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
    logger.trace(`${verb} ${file.kind} "${file.path}"`);
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
    [1, phase1BuilderFor],
    [2, phase2BuilderFor],
  ]) {
    logger.trace(`Start building`);
    for (const file of inventory.byPhase(phase)) {
      doBuild(selector(file.kind), file, context);
    }

    // The poor man's version of structured concurrency or fork/join
    logger.trace(`Wait for building to complete`);
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
  const { executor, inventory, logger, options } = context;
  const { contentDir } = options;

  // Build added or changed files but ignore deleted files.
  let building = false;
  let stopped = false;
  let pendingChanges = [];

  const rebuild = async () => {
    if (building) {
      return RETRY;
    } else if (stopped) {
      return undefined;
    }

    building = true;
    const changes = pendingChanges;
    pendingChanges = [];

    // Determine unique, changed files.
    const files = new Map();
    for (const { event, path } of changes) {
      const file = inventory.handleChange(event, path);
      if (event === 'add' || event === 'change') {
        files.set(path, file);
      } else if (event === 'unlink') {
        files.delete(path);
      }
    }

    // Phase 1
    logger.trace(`start rebuild`);

    const phase2 = [];
    for (const file of files.values()) {
      // Run phase 1 builder.
      let builder = phase1BuilderFor(file.kind);
      doBuild(builder, file, context);

      // Check for phase 2 builder
      builder = phase2BuilderFor(file.kind);
      if (builder) phase2.push({ builder, file });
    }
    await executor.onIdle();
    if (stopped) {
      building = false;
      return undefined;
    }

    // Phase 2
    for (const { builder, file } of phase2) {
      doBuild(builder, file, context);
    }
    await executor.onIdle();
    if (stopped) {
      building = false;
      return undefined;
    }

    // Determine impacted paths, including cool versions.
    const paths = [];
    for (const file of files.values()) {
      paths.push(file.path);
      if (file.path !== file.coolPath) paths.push(file.coolPath);
    }

    try {
      await afterBuild(paths);
    } finally {
      building = false;
    }

    logger.trace(`complete rebuild`);
    return undefined;
  };

  // Set up file system watcher. FIXME: componentDir?? followSymlinks??
  const triggerRebuild = debounce(rebuild, 500);
  const watcher = watch([contentDir], {
    followSymlinks: false,
    ignored: options.doNotBuild,
  }).on('all', (event, path) => {
    path = path.slice(contentDir.length - 1);
    logger.trace(`fsevent: ${event} "${path}"`);
    pendingChanges.push({ event, path });
    // Always trigger rebuild, so that rebuild function runs eventually.
    triggerRebuild();
  });

  // Return function to tear down watcher.
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await Promise.allSettled([
      watcher.close(),
      executor.stop()
    ]);
  };

  return stop;
}
