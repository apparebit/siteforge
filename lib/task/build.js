/**
 * @module task/build
 * @copyright (C) 2019 Robert Grimm
 */

import buildMarkup from './build-markup.js';
import buildScript from './build-script.js';
import buildStyle from './build-style.js';
import { copyFile } from '../tooling/fs.js';
import { escapeRegex } from '../tooling/text.js';
import { extname, join, relative } from 'path';
import { logger, options } from '../config.js';
import walk from '../tooling/walk.js';

export default async function build() {
  const renamedResources = new Map();
  const rename = (original, renamed) => {
    // These arrive as relative paths but are absolute paths on the website.
    original = '/' + original;
    renamed = '/' + renamed;

    if (renamedResources.has(original)) {
      const previous = renamedResources.get(original);
      if (previous !== renamed) {
        throw new Error(
          `Creating version "${renamed}" when "${previous}" already exists`
        );
      }
    } else {
      renamedResources.set(original, renamed);
    }
  };

  const dispatch = async from => {
    try {
      const diff = relative(options.contentDir, from);
      const to = join(options.buildDir, diff);

      let tmp;
      switch (extname(from)) {
        // >>>>> Markup <<<<<
        case '.htm':
        case '.html':
          return { type: 'html', from, diff, to };

        // >>>>> Styles <<<<<
        case '.css':
          logger.info(`Build style "${diff}"`);
          tmp = await buildStyle(from, to);
          rename(diff, relative(options.buildDir, tmp));
          break;

        // >>>>> Scripts <<<<<
        case '.js':
          logger.info(`Build script "${diff}"`);
          tmp = await buildScript(from, diff, to);
          rename(diff, relative(options.buildDir, tmp));
          break;

        // >>>>> Text, Web Manifests, Fonts, and Images <<<<<
        case '.gif':
        case '.jpg':
        case '.png':
        case '.svg':
        case '.txt':
        case '.webp':
        case '.webmanifest':
        case '.woff':
        case '.woff2':
          logger.info(`Copy "${diff}" to build`);
          await copyFile(from, to);
          break;

        // >>>>> .htaccess <<<<<
        default:
          if (diff === '.htaccess') {
            logger.info(`Copy "${diff}" to build`);
            await copyFile(from, to);
          } else {
            logger.warning(`Ignoring "${diff}" with unknown type`);
          }
      }
    } catch (x) {
      logger.error(`Could not build "${from}"`, x);
    }
    return undefined;
  };

  const delayedResources = [];
  for await (const entry of walk(options.contentDir)) {
    if (entry.type !== 'file') {
      throw new Error(`walk() yielded unexpected entry of type "${entry.type}`);
    }

    const maybeDelayed = await dispatch(entry.path);
    if (maybeDelayed) delayedResources.push(maybeDelayed);
  }

  const escapedPaths = [...renamedResources.keys()].map(escapeRegex);
  const changedPaths = new RegExp(escapedPaths.join('|'), 'gu');
  for (const resource of delayedResources) {
    try {
      await buildMarkup(resource, changedPaths, renamedResources);
    } catch (x) {
      logger.error(`Could not build "${resource.from}"`, x);
    }
  }
}
