/* © 2020 Robert Grimm */

import {
  copyFile,
  lstat,
  readFile,
  writeFile,
  writeVersionedFile,
} from '@grr/fs';

import { AbortError, ErrorMessage } from '@grr/oddjob/error';
import cssnano from 'cssnano';
import { EOL } from 'os';
import { join } from 'path';
import { minify } from 'terser';
import { pathToFileURL } from 'url';
import postcss from 'postcss';
import Prism from 'prismjs';
import 'prismjs/components/prism-python.js';
import { runInNewContext } from 'vm';

const { assign, create, defineProperty, freeze, hasOwn, setPrototypeOf } = Object;
const configurable = true;
const { has } = Reflect;

// -----------------------------------------------------------------------------

/** Create a fully featured file processing pipeline ("batteries included"). */
export function toBuilder(label, ...steps) {
  if (typeof label !== 'string') {
    steps.unshift(label);
    label = 'build';
  }

  const run = pipe(...steps);
  const build = async (file, context) => {
    const end = context.metrics.timer('build.time').start(file.path);

    const diff = await run(file, context);
    assign(file, diff);

    end();
    return file;
  };
  defineProperty(build, 'verb', { configurable, value: label });
  return build;
}

/** Create a bare file processing pipeline. */
export function pipe(...steps) {
  return async function pipe(file, context) {
    const { signal } = context;

    const diff = create(file);
    for (const step of steps) {
      if (signal?.aborted) throw new AbortError();

      let delta = step(diff, context);
      if (typeof delta?.then === 'function') {
        delta = await delta;
      }
      assign(diff, delta);
    }

    if (signal?.aborted) throw new AbortError();
    setPrototypeOf(diff, null);
    return diff;
  };
}

// -----------------------------------------------------------------------------

export async function readSource(file, context) {
  const result = create(null);

  // Update the metadata.
  let { encoding, path, source } = file;
  if (!source) {
    source = result.source = join(context.options.contentDir, path);
  }

  // Read in the data and remove byte order mark (if any).
  let content = await readFile(source, encoding || 'utf8');
  if (typeof content === 'string' && content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }
  result.content = content;
  return result;
}

export async function writeTarget(file, context) {
  if (context.options.dryRun) return undefined;
  const result = create(null);

  // Update the metadata.
  let { content, encoding, path, target } = file;
  if (!target) {
    target = result.target = join(context.options.buildDir, path);
  }

  // Write out the data.
  if (!context.options.dryRun) {
    if (!context.options.versionAssets || path === '/sw.js') {
      await writeFile(target, content, encoding || 'utf8');
    } else {
      target = await writeVersionedFile(target, content, encoding || 'utf8');
    }
    result.content = undefined;
  }
  return result;
}

export async function copyAsset(file, context) {
  const result = create(null);

  // Update the metadata.
  let { path, source, target } = file;
  if (!source) {
    source = result.source = join(context.options.contentDir, path);
  }
  if (!target) {
    target = result.target = join(context.options.buildDir, path);
  }

  // Copy the data.
  if (!context.options.dryRun) {
    await copyFile(source, target);
  }
  return result;
}

// -----------------------------------------------------------------------------

// Regex for extracting initial C-like comment from source file.
// Notice the 's' modifier so that '.' matches newlines.
const NOTICE = /^\s*\/\*(.*?)\*\/\s*/isu;

export function extractProvenanceNotice(file, context) {
  const { content } = file;
  const [prefix, notice] = content.match(NOTICE) || [];

  if (prefix) {
    // If available, preserve provenance notice from source code.
    return {
      provenance: notice.trim(),
      content: content.slice(prefix.length),
    };
  } else if (context?.options?.copyright) {
    // Otherwise, if configured, use that copyright notice.
    return {
      provenance: context.options.copyright,
    };
  } else {
    // Otherwise, there is none.
    return undefined;
  }
}

export function prefixProvenanceNotice(file) {
  let { provenance, content } = file;
  if (!provenance) return undefined;

  return {
    provenance: undefined,
    content: `/* ${provenance} */${EOL}${content}`,
  };
}

// -----------------------------------------------------------------------------

const FRONT_OPEN = /^\s*(<!--.*?--!>\s*)?<script[^>]*>/u;
const FRONT_CLOSE = '</script>';

export function extractFrontMatter(file) {
  const { content } = file;

  // Determine character range of front matter.
  const match = content.match(FRONT_OPEN);
  if (match == null) return undefined;
  const start = match[0].length;
  const end = content.indexOf(FRONT_CLOSE);
  if (end === -1) {
    throw new ErrorMessage(
      `front matter for "${file.path}" has no closing tag`
    );
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
    throw new ErrorMessage(`front matter for "${file.path}" is not an object`);
  } else {
    delete metadata.__proto__;
  }

  return {
    ...metadata,
    frontMatterEnd,
    content: content.slice(frontMatterEnd).trim(),
  };
}

export function indexByKeywords(file, context) {
  context.inventory.indexByKeywords(file);
  return undefined;
}

// -----------------------------------------------------------------------------

// Rename Prism's default class for comments because Safari Reader hides content
// with that class.
Prism.hooks.add('wrap', function (env) {
  env.classes = env.classes.map(function (c) {
    return c == "comment" ? "prism-comment" : c;
  });
});

// IS_INVALID includes all properties of Object.prototype. Their values are
// functions and not languages, so their truthiness is just what's needed.
const IS_INVALID = freeze({
  "DFS": true,
  "extend": true,
  "insertBefore": true,
});

function highlight(block, language, code) {
  if (!language || IS_INVALID[language]) return block;

  const grammar = Prism.languages[language];
  if (!grammar) return block;

  code = Prism.highlight(code, grammar, language);
  return `<pre><code class=language-${language}>${code}</code></pre>`
}

const PRE_CODE = /<pre><code class="?language-([a-z]+)"?>(.*?)<\/code><\/pre>/gisu

export function highlightSyntax(file) {
  const { content } = file;
  return {
    content: content.replaceAll(PRE_CODE, highlight),
  }
}

// -----------------------------------------------------------------------------

// async function loadData(file, context) {
//   const { path } = file;
//   const url = pathToFileURL(join(context.options.contentDir, path));

//   let module;
//   try {
//     module = await import(url);
//   } catch (x) {
//     const error = new ErrorMessage(`unable to load data "${path}"`);
//     error.cause = x;
//     throw error;
//   }

//   if (typeof module.default !== 'function') return module;

//   const data = await module.default(module, context);
//   if (data == null || typeof data !== 'object') {
//     throw new ErrorMessage(`data source "${path}" is not an object`);
//   }
//   return data;
// }

async function loadComponent(spec, context) {
  const url = pathToFileURL(join(context.options.componentDir, spec));
  let finalSpec;
  try {
    finalSpec = (await lstat(url)).isFile() ? url.href : spec;
  } catch {
    finalSpec = spec;
  }

  let component;
  try {
    component = await import(finalSpec);
  } catch (x) {
    const error = new ErrorMessage(`unable to load component "${spec}"`);
    error.cause = x;
    throw error;
  }

  if (typeof component.default !== 'function') {
    throw new ErrorMessage(
      `component "${spec}" doesn't default export function`
    );
  }
  return component;
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
  const result = create(null);
  const component = await loadComponent(pageProvider, context);
  result.content = await component.default(file, context);
  return result;
}

// -----------------------------------------------------------------------------

export async function minifyScript(file) {
  const minified = await minify(file.content, {
    ecma: 2015,
    format: {
      comments: false,
    }
  });
  return { content: minified.code }
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
