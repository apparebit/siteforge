/* © 2019 Robert Grimm */

import { basename, dirname, extname, join } from 'path';
import buildMarkup from './build-markup.js';
import buildScript from './build-script.js';
import buildStyle from './build-style.js';
import { copyFile } from '../tooling/fs.js';
import Error from '../tooling/error.js';
import { escapeRegex } from '../tooling/text.js';
import Walk from '../tooling/walk.js';

const { apply } = Reflect;

export default async function build() {
  const renamedResources = new Map();
  const recordRenaming = (original, renamed) => {
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

  const dispatch = async (from, vpath) => {
    try {
      const to = join(this.options.buildDir, vpath.slice(1));

      let tmp;
      switch (extname(from)) {
        // >>>>> Markup <<<<<
        case '.htm':
        case '.html':
          return { type: 'html', vpath, from, to };

        // >>>>> Styles <<<<<
        case '.css':
          this.logger.info(`Build style "${vpath}"`);
          tmp = await apply(buildStyle, this, [from, to]);
          if (tmp !== to) {
            const versioned = join(dirname(vpath), basename(tmp));
            this.logger.info(`Using version name "${versioned}"`);
            recordRenaming(vpath, versioned);
          }
          break;

        // >>>>> Scripts <<<<<
        case '.js':
          this.logger.info(`Build script "${vpath}"`);
          tmp = await apply(buildScript, this, [from, to, vpath]);
          if (tmp !== to) {
            const versioned = join(dirname(vpath), basename(tmp));
            this.logger.info(`Using version name "${versioned}"`);
            recordRenaming(vpath, versioned);
          }
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
          this.logger.info(`Copy "${vpath}" to build`);
          await copyFile(from, to);
          break;

        // >>>>> .htaccess <<<<<
        default:
          if (vpath === '/.htaccess') {
            this.logger.info(`Copy "${vpath}" to build`);
            await copyFile(from, to);
          } else {
            this.logger.warning(`Ignoring "${vpath}" with unknown type`);
          }
      }
    } catch (x) {
      throw Error(`Unable to build "${vpath}"`, x);
    }
    return undefined;
  };

  const delayedResources = [];
  const walk = new Walk(this.options.contentDir, {
    isExcluded: this.options.doNotBuild,
  });

  for await (const { type, path, vpath } of walk.go()) {
    if (type !== 'file') {
      throw Error(`Walk() yielded unexpected entry of type "${type}"`);
    }

    const maybeDelayed = await dispatch(path, vpath);
    if (maybeDelayed) delayedResources.push(maybeDelayed);
  }

  let changedPaths;
  if (this.options.versionAssets && renamedResources.size) {
    const escapedPaths = [...renamedResources.keys()].map(escapeRegex);
    changedPaths = new RegExp(escapedPaths.join('|'), 'gu');
  }

  for (const resource of delayedResources) {
    try {
      await apply(buildMarkup, this, [
        resource,
        changedPaths,
        renamedResources,
      ]);
    } catch (x) {
      throw Error(`Unable to build "${resource.vpath}"`, x);
    }
  }
}
