/* © 2020 Robert Grimm */

import { posix } from 'path';
import { readFile, writeFile, writeVersionedFile } from '@grr/fs';
import { runInNewContext } from 'vm';
import { strict } from 'assert';

const { assign, defineProperties } = Object;
const { basename, dirname, extname, isAbsolute, join, parse, relative } = posix;
const configurable = true;
const enumerable = true;
const FRONT_OPEN = /\s*(<!--.*?--!>\s*)?<script[^>]*>/u;
const FRONT_CLOSE = '</script>';
const { parse: parseJson, stringify: stringifyJson } = JSON;

// =============================================================================

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

// Popular copy pasta refined with local seasoning
// (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
const escapeRegex = literal => literal.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

// =============================================================================

class File {
  /** Map the given file path to its extension. */
  static extension(path) {
    let { name, ext } = parse(path);
    let ext2;
    if (ext === '.js') {
      ext2 = extname(name);
      if (ext2) {
        ext = ext2 + ext;
      }
    }
    return ext;
  }

  /**
   * Map the given file extension to a coarser content kind. Unknown or
   * non-existent extensions map to `undefined`
   */
  static kind(extension) {
    return {
      '.css': 'style',
      '.data.js': 'data',
      '.gif': 'image',
      '.htm': 'markup',
      '.html': 'markup',
      '.jpg': 'image',
      '.jpeg': 'image',
      '.js': 'script',
      '.png': 'image',
      '.txt': 'etc', // E.g., robots.txt
      '.webmanifest': 'etc', // PWAs
      '.webp': 'image',
      '.woff': 'font',
      '.woff2': 'font',
    }[extension || ''];
  }

  /** Create a new path joining the given root with the given path. */
  static mount(path, root) {
    if (isAbsolute(path)) path = relative('/', path);
    return join(root, path);
  }

  /** Create a new path with `from`'s file name and `to`'s directory. */
  static reroot(from, to) {
    return join(dirname(to), basename(from));
  }

  // ---------------------------------------------------------------------------

  constructor(inventory, path, data = {}) {
    strict.ok(inventory instanceof Inventory);
    strict.equal(typeof path, 'string');

    assign(this, data);

    const ext = File.extension(path);
    defineProperties(this, {
      extension: {
        configurable,
        enumerable,
        value: ext,
      },
      kind: {
        configurable,
        enumerable,
        value: File.kind(ext),
      },
      inventory: {
        configurable,
        enumerable,
        value: inventory,
      },
      path: {
        configurable,
        enumerable,
        value: path,
      },
    });
  }

  mountPath(root) {
    return File.mount(this.path, root);
  }

  async read({
    encoding = this.encoding || 'utf8',
    source = this.source,
  } = {}) {
    // Validate `source` path and optional `encoding`.
    strict.ok(source);
    strict.equal(typeof source, 'string');
    strict.equal(typeof encoding, 'string');
    if (!this.source) this.source = source;

    let json = false;
    if (encoding === 'json') {
      encoding = 'utf8';
      json = true;
    }

    // Actually read the file.
    let content = await readFile(source, encoding);
    if (typeof content === 'string' && content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }
    if (json) {
      content = parseJson(content);
    }
    this.content = content;
    return content;
  }

  extractCopyrightNotice() {
    const { content } = this;
    strict.equal(typeof content, 'string');

    const [prefix, copyright] = content.match(NOTICE) || [];
    if (!prefix) return undefined;

    this.copyright = copyright.trim();
    this.content = content.slice(prefix.length);
    return this.copyright;
  }

  prefixCopyrightNotice() {
    let { copyright, content } = this;
    if (!copyright) return;
    strict.equal(typeof copyright, 'string');
    strict.equal(typeof content, 'string');

    this.content = `/* ${copyright} */ ${content}`;
  }

  extractFrontMatter() {
    const { content } = this;
    strict.equal(typeof content, 'string');

    // Determine character range of front matter.
    const match = content.match(FRONT_OPEN);
    if (match == null) return undefined;
    const start = match[0].length;
    const end = content.indexOf(FRONT_CLOSE);
    if (end === -1) {
      throw new Error(`front matter for "${this.path}" has no closing tag`);
    }

    // Evaluate and validate front matter.
    const metadata = runInNewContext(
      `(${content.slice(start, end)})`,
      undefined, // create fresh sandbox
      {
        filename: this.path,
        displayErrors: true,
        contextCodeGeneration: {
          strings: false, // no eval()
          wasm: false, // no wasm
        },
      }
    );

    if (metadata == null || typeof metadata !== 'object') {
      throw new Error(`front matter for "${this.path}" is not an object`);
    }

    // Patch file object.
    this.metadata = metadata;
    this.content = content.slice(end + FRONT_CLOSE.length).trim();
    return metadata;
  }

  async transform(fn, { withCopyrightNotice = false } = {}) {
    strict.equal(typeof fn, 'function');

    if (withCopyrightNotice) this.extractCopyrightNotice();
    this.content = await fn(this.content);
    if (withCopyrightNotice) this.prefixCopyrightNotice();
  }

  async write({
    encoding = this.encoding || 'utf8',
    targetDir = this.targetDir,
    versioned = this.versioned,
  } = {}) {
    const { content, path } = this;
    strict.ok(typeof content === 'string' || content instanceof Buffer);
    strict.equal(typeof path, 'string');
    strict.equal(typeof targetDir, 'string');

    const target = join(targetDir, path);
    if (!versioned) {
      await writeFile(target, content, encoding);
      this.target = target;
    } else {
      const effective = await writeVersionedFile(target, content, encoding);
      this.target = File.reroot(effective, target);
    }

    // Now that the content has been written out, we don't need it in memory.
    delete this.content;
  }

  toString() {
    return `File(${this.path})`;
  }
}

// =============================================================================

class Directory {
  static is(value) {
    return value instanceof Directory;
  }

  #inventory;
  #path;
  #entries;

  constructor(parent, name) {
    this.#entries = new Map();
    this.#entries.set('.', this);

    if (!Directory.is(parent)) {
      this.#inventory = parent;
      this.#entries.set('..', this);
      this.#path = '/';
    } else {
      this.#inventory = parent.#inventory;
      this.#entries.set('..', parent);
      parent.#entries.set(name, this);
      this.#path = join(parent.#path, name);
    }
  }

  // prettier-ignore
  get path() { return this.#path; }

  lookup(
    path,
    { fillInMissingSegments = false, validateLastSegment = false } = {}
  ) {
    strict.equal(typeof path, 'string');

    if (path === '/') return this.#inventory.root;

    let segments, cursor;
    if (isAbsolute(path)) {
      segments = path.split('/').slice(1);
      cursor = this.#inventory.root;
    } else {
      segments = path.split('/');
      cursor = this;
    }

    for (let index = 0; index < segments.length; index++) {
      const name = segments[index];

      if (cursor.#entries.has(name)) {
        const skip = index < segments.length - 1 || !validateLastSegment;
        const entry = cursor.#entries.get(name);

        if (skip || Directory.is(entry)) {
          cursor = entry;
        } else {
          throw new Error(
            `entry "${name}" in directory "${cursor.#path}" is not a directory`
          );
        }
      } else if (fillInMissingSegments) {
        cursor = new Directory(cursor, name);
      } else {
        throw new Error(
          `entry "${name}" in directory "${cursor.#path}" does not exist`
        );
      }
    }

    return cursor;
  }

  addFile(name, data = {}) {
    strict.equal(typeof name, 'string');
    if (this.#entries.has(name)) {
      throw new Error(
        `entry "${name}" in directory "${this.#path}" already exists`
      );
    }

    const file = new File(this.#inventory, join(this.#path, name), data);
    this.#entries.set(name, file);
    this.#inventory.indexByKind(file);
    return file;
  }

  // ---------------------------------------------------------------------------

  /** Convert this directory object to JSON. */
  toJSON() {
    const entries = {};
    for (const [name, value] of this.#entries) {
      if (name !== '.' && name !== '..') {
        if (Directory.is(value)) {
          entries[name] = value.toJSON();
        } else {
          entries[name] = value.toString();
        }
      }
    }
    return entries;
  }

  /** Convert this directory object to a string. */
  toString() {
    return stringifyJson(this.toJSON(), null, 2);
  }
}

// =============================================================================

export default class Inventory {
  static create() {
    return new Inventory();
  }

  #root;
  #byKind;
  #renamed;

  constructor() {
    this.#root = new Directory(this);

    this.#byKind = {
      data: new Map(),
      etc: new Map(),
      font: new Map(),
      image: new Map(),
      markup: new Map(),
      script: new Map(),
      style: new Map(),
    };

    this.#renamed = new Map();
  }

  get root() {
    return this.#root;
  }

  addFile(path, data = {}) {
    const { dir, base } = parse(path);
    return this.#root
      .lookup(dir, { fillInMissingSegments: true, validateLastSegment: true })
      .addFile(base, data);
  }

  lookup(path, options) {
    return this.#root.lookup(path, options);
  }

  indexByKind(file) {
    let { path, kind } = file;
    if (kind) this.#byKind[kind].set(path, file);
  }

  *byKind(...kinds) {
    for (const kind of kinds) {
      yield* this.#byKind[kind];
    }
  }

  renamePath(from, to) {
    const previously = this.#renamed.get(from);
    if (previously) {
      if (to !== previously) {
        throw new Error(
          `path "${from}" has already been renamed to "${previously}"`
        );
      }
    } else {
      this.#renamed.set(from, to);
    }
  }

  lookupRenamedPath(path) {
    return this.#renamed.get(path);
  }

  matchRenamedPath() {
    return new RegExp(
      this.#renamed
        .keys()
        .map(p => escapeRegex(p))
        .join('|'),
      'u'
    );
  }

  toString() {
    return stringifyJson({ inventory: { '/': this.#root.toJSON() } }, null, 2);
  }
}
