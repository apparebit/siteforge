/* © 2020 Robert Grimm */

import {
  copyFile,
  createWriteStream,
  drain,
  readFile,
  writeFile,
  writeVersionedFile,
} from '@grr/fs';

import cssnano from 'cssnano';
import { html, render } from '@grr/proact';
import { join } from 'path';
import minify from 'babel-minify';
import Model from '@grr/html';
import { pathToFileURL } from 'url';
import postcss from 'postcss';
import { runInNewContext } from 'vm';

const { assign, create, setPrototypeOf } = Object;
const { parse: doParseJSON } = JSON;

// -----------------------------------------------------------------------------
// Regular expression madness

const FRONT_OPEN = /\s*(<!--.*?--!>\s*)?<script[^>]*>/u;
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

export function parseJSON(file) {
  return { content: doParseJSON(file.content) };
}

// -----------------------------------------------------------------------------

export function extractCopyrightNotice(file, context) {
  const { content } = file;

  const [prefix, _, copyright] = content.match(NOTICE) || [];
  if (prefix) {
    // If present, preserve copyright notice from source code.
    return {
      __proto__: null,
      copyright: copyright.trim(),
      content: content.slice(prefix.length),
    };
  } else if (context && context.options && context.options.copyright) {
    // If part of configuration, use that notice instead.
    return {
      __proto__: null,
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
    __proto__: null,
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
  }

  return {
    __proto__: null,
    ...metadata,
    content: content.slice(end + FRONT_CLOSE.length).trim(),
  };
}

// -----------------------------------------------------------------------------

// Currently, one of few functions that does not adhere to the (file, context)
// -> diff signature.
export async function loadComponent(name, context) {
  const path = join(context.options.includeDir, name);

  if (!context.components[name]) {
    let component;

    try {
      // Try include directory first (using file URL, since path probably is
      // absolute).
      component = await import(pathToFileURL(path));
    } catch {
      // Fall back onto Node.js' regular module resolution.
      try {
        component = await import(name);
      } catch {
        throw new Error(
          `unable to locate layout module "${name}" (not an include: "${path}")`
        );
      }
    }

    context.components[name] = component;
    return component;
  } else {
    return context.components[name];
  }
}

export function parseMarkup(file) {
  return { __proto__: null, content: html([file.content], []) };
}

export async function assemblePage(file, context) {
  const result = create(null);

  let { page } = file;
  if (!page && context.options.pageProvider) {
    page = result.page = context.options.pageProvider;
  }

  const PageProvider = page
    ? await loadComponent(page, context)
    : ({ content }) => content;
  result.content = await PageProvider(file, context);

  return result;
}

export async function renderToFile(file, context) {
  const result = create(null);
  result.content = undefined;

  let { content, path, target } = file;
  if (!target) {
    target = result.target = join(context.options.buildDir, path);
  }

  const model = await Model.load();
  const writable = createWriteStream(target);
  for await (const fragment of render(content, { model })) {
    if (!writable.write(fragment)) {
      await drain(writable);
    }
  }
  writable.end();

  return result;
}

// -----------------------------------------------------------------------------

export async function loadModule(file, context) {
  const result = create(null);

  let { path, source } = file;
  if (!source) {
    source = result.source = join(context.options.contentDir, path);
  }

  result.content = await import(source);
  return result;
}

export async function runModule(file, context) {
  let { content } = file;
  if (typeof content.default !== 'function') {
    throw new Error(`default export of "${file.path}" is not a function`);
  }

  try {
    // FIXME Make call consistent with VDOM rendering.
    content = content.default(file, context);
    if (content && typeof content === 'function') content = await content;
  } catch (x) {
    const error = new Error(
      `default export of "${file.path}" signalled error: ${x.message}`
    );
    error.cause = x;
    throw error;
  }

  return { __proto__: null, content };
}

// -----------------------------------------------------------------------------

export function minifyScript(file) {
  return {
    __proto__: null,
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
