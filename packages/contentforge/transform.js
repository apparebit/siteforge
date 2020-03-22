/* © 2020 Robert Grimm */

import {
  copyFile,
  lstat,
  readFile,
  writeFile,
  writeVersionedFile,
} from '@grr/fs';

import cssnano from 'cssnano';
import { join } from 'path';
import minify from 'babel-minify';
import { pathToFileURL } from 'url';
import postcss from 'postcss';
import { runInNewContext } from 'vm';

const { assign, create, defineProperty, setPrototypeOf } = Object;
const configurable = true;
const { has } = Reflect;

// -----------------------------------------------------------------------------
// Regular expression madness

const FRONT_OPEN = /^\s*(<!--.*?--!>\s*)?<script[^>]*>/u;
const FRONT_CLOSE = '</script>';

// Regex for extracting copyright notice at top of source file.
const NOTICE = new RegExp(
  `^` + // Start at the beginning.
  `(?:#![^\\r?\\n]*\\r?\\n)?` + // Ignore the hashbang if present.
  `\\s*` + // Also ignore any space if present.
  `(?:` + // Match either just a multi-line comment or 1+ single-line comments.
  `(?:\\/\\*` + // Multi-line comment it is.
  `[\\s*_=-]*` + // Ignore any number of spacing or "decorative" characters.
  `((?:\\(c\\)|©|copyright).*?)` + // Extract the copyright notice.
  `[\\s*_=-]*` + // Again, ignore spacing or decorative characters.
  `\\*\\/)` + // Until we reach end of comment: It's safe to split content here.
  `|(?:\\/\\/[\\p{Zs}*_=-]*\\n)*` + // Or: Single-line comments its is.
    `(?:\\/\\/\\p{Zs}*((?:\\(c\\)|©|copyright).*?)(\\n|$)))`, // Extract notice.
  'iu' // Oh yeah, ignore case and embrace the Unicode.
);

// -----------------------------------------------------------------------------

/**
 * Create a new function that serially applies the given steps, with the result
 * of one step becoming the argument of the next step. The new function and its
 * steps differ from a straight-forward functional pipeline implementation in
 * two important ways: First, they take a second argument with the execution
 * context (options, logger, and so on). Second, they do not modify the argument
 * but rather return an object with modified properties only. If a step does not
 * modify the argument, it should return `undefined`.
 */
export function build(label, ...steps) {
  return async function process(file, context) {
    // Measure latency in nanoseconds. Log resource being built.
    const start = global.process.hrtime.bigint();
    const { path, kind } = file;
    context.logger.info(`Building ${kind} "${path}"`);

    const diff = await pipe(...steps)(file, context);

    const end = global.process.hrtime.bigint();
    const entry = { path, kind, label, duration: end - start };
    context.stats.resources.push(entry);

    return assign(file, diff);
  };
}

export function pipe(...steps) {
  return async function process(file, context) {
    const diff = create(file);
    for (const step of steps) {
      let delta = step(diff, context);
      if (delta && typeof delta.then === 'function') {
        delta = await delta;
      }
      assign(diff, delta);
    }
    setPrototypeOf(diff, null);
    return diff;
  };
}

// -----------------------------------------------------------------------------

export async function readSource(file, context) {
  const result = create(null);

  let { encoding, path, source } = file;
  if (!source) {
    source = result.source = join(context.options.contentDir, path);
  }

  let content = await readFile(source, encoding || 'utf8');
  if (typeof content === 'string' && content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }
  result.content = content;
  return result;
}

export async function writeTarget(file, context) {
  const result = create(null);
  result.content = undefined;

  let { content, encoding, path, target } = file;
  if (!target) {
    target = result.target = join(context.options.buildDir, path);
  }

  if (!context.options.versionAssets || path === '/sw.js') {
    await writeFile(target, content, encoding || 'utf8');
  } else {
    target = await writeVersionedFile(target, content, encoding || 'utf8');
  }
  return result;
}

export async function copyAsset(file, context) {
  const result = create(null);

  let { path, source, target } = file;
  if (!source) {
    source = result.source = join(context.options.contentDir, path);
  }
  if (!target) {
    target = result.target = join(context.options.buildDir, path);
  }

  await copyFile(source, target);
  return result;
}

// -----------------------------------------------------------------------------

export function extractCopyrightNotice(file, context) {
  const { content } = file;
  const [prefix, copy1, copy2] = content.match(NOTICE) || [];

  if (prefix) {
    // If present, preserve copyright notice from source code.
    return {
      copyright: (copy1 || copy2).trim(),
      content: content.slice(prefix.length),
    };
  } else if (context && context.options && context.options.copyright) {
    // If part of configuration, use that notice instead.
    return {
      copyright: context.options.copyright,
    };
  } else {
    return undefined;
  }
}

export function prefixCopyrightNotice(file) {
  let { copyright, content } = file;
  if (!copyright) return undefined;

  return {
    copyright: undefined,
    content: `/* ${copyright} */ ${content}`,
  };
}

// -----------------------------------------------------------------------------

export function extractFrontMatter(file) {
  const { content } = file;

  // Determine character range of front matter.
  const match = content.match(FRONT_OPEN);
  if (match == null) return undefined;
  const start = match[0].length;
  const end = content.indexOf(FRONT_CLOSE);
  if (end === -1) {
    throw new Error(`front matter for "${file.path}" has no closing tag`);
  }
  const frontMatterEnd = end + FRONT_CLOSE.length;

  // Evaluate and validate front matter.
  const metadata = runInNewContext(
    `(${content.slice(start, end)})`,
    undefined, // create fresh sandbox
    {
      thisname: file.path,
      displayErrors: true,
      contextCodeGeneration: {
        strings: false, // Disable eval()
        wasm: false, // Disable wasm
      },
    }
  );

  if (metadata == null || typeof metadata !== 'object') {
    throw new Error(`front matter for "${file.path}" is not an object`);
  } else {
    delete metadata.__proto__;
  }

  return {
    ...metadata,
    frontMatterEnd,
    content: content.slice(frontMatterEnd).trim(),
  };
}

// -----------------------------------------------------------------------------

async function loadComponent(spec) {
  const url = pathToFileURL(join(context.options.componentDir, spec));
  let finalSpec;
  try {
    finalSpec = (await lstat(url)).isFile() ? url : spec;
  } catch {
    finalSpec = spec;
  }

  try {
    return import(finalSpec);
  } catch (x) {
    const error = new Error(`unable to load component "${spec}"`);
    error.cause = x;
    throw error;
  }
}

class CachingLoader {
  #components = new Map();

  load(spec) {
    if (!this.#components.has(spec)) {
      this.#components.set(spec, loadComponent(spec));
    }
    return this.#components.get(spec);
  }
}

function toComponent(name, module) {
  if (typeof module.default === 'function') {
    defineProperty(module.default, 'name', {
      configurable,
      value: name,
    });
    return module.default;
  } else {
    throw new TypeError(`module "${name}" doesn't default export function`);
  }
}

async function loadComponent0(name, context) {
  context.logger.info(`Loading component "${name}"`);
}

export async function assemblePage(file, context) {
  let pageProvider;
  if (has(file, 'pageProvider')) {
    // Use file.pageProvider if it exists, so that undefined disables assembly.
    ({ pageProvider } = file);
  } else {
    ({ pageProvider } = context.options);
  }
  if (!pageProvider) return undefined;

  // Load the page provider and apply it.
  const Page = await loadComponent(pageProvider, context);
  const result = create(null);
  result.content = await Page(file, context);
  return result;
}

// -----------------------------------------------------------------------------

export function minifyScript(file) {
  return {
    content: minify(file.content, {}, { comments: false }).code,
  };
}

const css = postcss([cssnano({ preset: 'default' })]);

// function reportPostCSSWarning(logger, warn) {
//   let msg = '';
//   if (warn.node && warn.node.type !== 'root') {
//     msg += `${warn.node.source.start.line}:${warn.node.source.start.column}: `;
//   }
//   msg += warn.text;
//   if (warn.plugin) {
//     msg += ` [${warn.plugin}]`;
//   }
//   logger.warning(msg);
// }

export async function minifyStyle(file, context) {
  const minified = await css.process(file.content, {
    from: file.source || join(context.options.contentDir, file.path),
    to: join(context.options.buildDir, file.path),
  });
  return { content: minified.css };
}
