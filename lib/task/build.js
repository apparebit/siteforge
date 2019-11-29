/* © 2019 Robert Grimm */

import buildMarkup from './build-markup.js';
import buildScript from './build-script.js';
import buildStyle from './build-style.js';
import { copyFile } from '../tooling/fs.js';
import Error from '../tooling/error.js';
import { escapeRegex } from '../tooling/text.js';
import { extname, join, relative } from 'path';
import Walk from '../tooling/walk.js';

const { apply } = Reflect;

export default async function build() {
  const renamedResources = new Map();
  const rename = (original, renamed) => {
    // These arrive as relative paths but are absolute paths on the website.
    original = '/' + original;
    renamed = '/' + renamed;

    if (renamedResources.has(original)) {
      const previous = renamedResources.get(original);
      if (previous !== renamed) {
        throw Error(
          `Creating version "${renamed}" when "${previous}" already exists`
        );
      }
    } else {
      renamedResources.set(original, renamed);
    }
  };

  const dispatch = async from => {
    try {
      const diff = relative(this.options.contentDir, from);
      const to = join(this.options.buildDir, diff);

      let tmp;
      switch (extname(from)) {
        // >>>>> Markup <<<<<
        case '.htm':
        case '.html':
          return { type: 'html', from, diff, to };

        // >>>>> Styles <<<<<
        case '.css':
          this.logger.info(`Build style "${diff}"`);
          tmp = await apply(buildStyle, this, [from, to]);
          rename(diff, relative(this.options.buildDir, tmp));
          break;

        // >>>>> Scripts <<<<<
        case '.js':
          this.logger.info(`Build script "${diff}"`);
          tmp = await apply(buildScript, this, [from, diff, to]);
          rename(diff, relative(this.options.buildDir, tmp));
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
          this.logger.info(`Copy "${diff}" to build`);
          await copyFile(from, to);
          break;

        // >>>>> .htaccess <<<<<
        default:
          if (diff === '.htaccess') {
            this.logger.info(`Copy "${diff}" to build`);
            await copyFile(from, to);
          } else {
            this.logger.warning(`Ignoring "${diff}" with unknown type`);
          }
      }
    } catch (x) {
      throw Error(`Could not build "${from}"`, x);
    }
    return undefined;
  };

  const delayedResources = [];
  const walk = new Walk(this.options.contentDir, {
    isExcluded: this.options.doNotBuild,
  });
  for await (const entry of walk.go()) {
    if (entry.type !== 'file') {
      throw Error(`Walk() yielded unexpected entry of type "${entry.type}"`);
    }

    const maybeDelayed = await dispatch(entry.path);
    if (maybeDelayed) delayedResources.push(maybeDelayed);
  }

  const escapedPaths = [...renamedResources.keys()].map(escapeRegex);
  const changedPaths = new RegExp(escapedPaths.join('|'), 'gu');
  for (const resource of delayedResources) {
    try {
      await apply(buildMarkup, this, [
        resource,
        changedPaths,
        renamedResources,
      ]);
    } catch (x) {
      throw Error(`Could not build "${resource.from}"`, x);
    }
  }
}
