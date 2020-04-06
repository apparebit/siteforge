/* © 2020 Robert Grimm */

import { isDefaultAssetPath, toKind, KIND } from './path.js';
import { posix } from 'path';
import { escapeRegex, slugify } from '@grr/oddjob/string';
import { strict as assert } from 'assert';

const { assign, create, defineProperties, freeze } = Object;
const { dirname, isAbsolute, join, parse, relative } = posix;
const configurable = true;
const EMPTY_ARRAY = [];
const enumerable = true;
const { iterator } = Symbol;
const LA_FLOR = Symbol('secret');
const { stringify: stringifyJson } = JSON;

const PHASE = freeze({
  DATA: 1,
  ASSET: 2,
  PAGE: 3,
});

// =============================================================================

class File {
  constructor(path, kind, data) {
    assign(this, data);
    defineProperties(this, {
      path: { configurable, enumerable, value: path },
      kind: { configurable, enumerable, value: kind },
    });
  }

  toString() {
    return `File(${this.kind} ${this.path})`;
  }
}

// =============================================================================

class Directory {
  #path;
  #entries;

  constructor(parent = this, name = '/') {
    if (parent === this) {
      this.#path = name;
    } else {
      this.#path = join(parent.#path, name);
      parent.#entries.set(name, this);
    }
    this.#entries = new Map();
    this.#entries.set('.', this);
    this.#entries.set('..', parent);
  }

  /** Determine this directory's path. */
  get path() {
    return this.#path;
  }

  /**
   * Create an iterator over this directory's entries. The iterator skips the
   * `.` and `..` entries naming this directory and its parent.
   */
  *entries() {
    for (const name of this.#entries.keys()) {
      if (name !== '.' && name !== '..') {
        yield this.#entries.get(name);
      }
    }
  }

  /**
   * Create an iterator over this directory's files. The iterator recurses into
   * nested directories.
   */
  *files() {
    for (const entry of this.entries()) {
      if (entry instanceof Directory) {
        yield* entry.files();
      } else {
        yield entry;
      }
    }
  }

  /** Look up the directory or file with the given relative path. */
  lookup(
    path,
    { fillInMissingSegments = false, validateLastSegment = false } = {}
  ) {
    assert.ok(!isAbsolute(path), 'path must be relative');

    const segments = path.split('/');

    let cursor = this;
    for (let index = 0; index < segments.length; index++) {
      const name = segments[index];

      if (cursor.#entries.has(name)) {
        const skip = !validateLastSegment && index === segments.length - 1;
        const entry = cursor.#entries.get(name);

        if (entry instanceof Directory || skip) {
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

  _add(secret, name, kind, data) {
    assert.equal(secret, LA_FLOR, `Don't call me, I'll call you!`);
    assert.ok(name && typeof name === 'string');

    if (this.#entries.has(name)) {
      throw new Error(`directory "${this.#path}" already has entry "${name}"`);
    }

    const path = join(this.#path, name);
    const file = new File(path, kind, data);
    this.#entries.set(name, file);
    return file;
  }

  // ---------------------------------------------------------------------------

  toJSON() {
    const entries = create(null);
    for (const [name, value] of this.#entries) {
      if (name !== '.' && name !== '..') {
        if (value instanceof Directory) {
          entries[name] = value.toJSON();
        } else {
          entries[name] = value.toString();
        }
      }
    }
    return entries;
  }

  toString() {
    return stringifyJson(this.toJSON(), null, 2);
  }
}

// =============================================================================

export default class Inventory {
  /** Enumerate phases `DATA`, `ASSET`, and `PAGE` in proper order. */
  static get PHASE() {
    return PHASE;
  }

  #size = 0;
  #root = new Directory();
  #byKind = new Map();
  #byKeyword = new Map();
  #versionedPaths = new Map();
  #isStaticAsset;

  constructor({ isStaticAsset = isDefaultAssetPath } = {}) {
    this.#isStaticAsset = isStaticAsset;
  }

  get size() {
    return this.#size;
  }

  /**
   * Add a file with the given path and optional properties. Intermediate
   * directories are automatically generated as necessary.
   */
  add(path, data = create(null)) {
    assert.ok(isAbsolute(path), 'path must be absolute');

    // Create new file object within directory hierarchy.
    let { dir, base } = parse(path);
    let parent = this.#root;
    if (dir !== '/') {
      parent = parent.lookup(relative('/', dir), {
        fillInMissingSegments: true,
        validateLastSegment: true,
      });
    }
    const kind = toKind(path, this.#isStaticAsset);
    const file = parent._add(LA_FLOR, base, kind, data);
    this.#size++;

    // Add file to kind index.
    if (this.#byKind.has(kind)) {
      this.#byKind.get(kind).push(file);
    } else {
      this.#byKind.set(kind, [file]);
    }

    return file;
  }

  /**
   * Index the file by its keywords. Each keyword is first converted into
   * the corresponding slug, though the original is also preserved.
   */
  indexByKeywords(file) {
    const { keywords } = file;

    if (keywords && typeof keywords[iterator] === 'function') {
      for (let keyword of keywords) {
        keyword = keyword.normalize('NFC');
        const slug = slugify(keyword);

        if (!this.#byKeyword.has(slug)) {
          this.#byKeyword.set(slug, {
            keyword: slug,
            display: [keyword],
            files: [file],
          });
        } else {
          const { display, files } = this.#byKeyword.get(slug);
          if (!display.includes(keyword)) display.push(keyword);
          if (!files.includes(file)) files.push(file);
        }
      }
    }
  }

  /** Get the root directory. */
  get root() {
    return this.#root;
  }

  /** Look up a single file by the given name. */
  byPath(path, options) {
    assert.ok(isAbsolute(path), 'path must be absolute');
    if (path === '/') return this.#root;

    path = relative('/', path);
    return this.#root.lookup(path, options);
  }

  /** Look up some files by their kinds. */
  *byKind(...kinds) {
    for (const kind of kinds) {
      yield* this.#byKind.get(kind) || EMPTY_ARRAY;
    }
  }

  /** Look up files by tool phase. */
  *byPhase(phase) {
    switch (phase) {
      case PHASE.DATA:
        yield* this.#byKind.get(KIND.DATA) || EMPTY_ARRAY;
        break;
      case PHASE.ASSET:
        for (const [kind, index] of this.#byKind) {
          if (
            kind === KIND.CONTENT_SCRIPT ||
            kind === KIND.DATA ||
            kind === KIND.MARKUP
          ) {
            continue;
          }
          yield* index || EMPTY_ARRAY;
        }
        break;
      case PHASE.PAGE:
        yield* this.#byKind.get(KIND.CONTENT_SCRIPT) || EMPTY_ARRAY;
        yield* this.#byKind.get(KIND.MARKUP) || EMPTY_ARRAY;
        break;
      default:
        assert.fail('phase must be 1, 2, or 3');
    }
  }

  /** Get all keywords currently in use. */
  keywords() {
    return this.#byKeyword.keys();
  }

  /** Look up files by keyword. */
  byKeyword(keyword) {
    const slug = slugify(keyword);
    const entry = this.#byKeyword.get(slug);

    return {
      keyword: slug,
      display: entry ? [...entry.display] : [keyword],
      files: entry ? [...entry.files] : [],
    };
  }

  // ---------------------------------------------------------------------------

  /**
   * Mark path as versioned through second argument. The two paths must be the
   * same with exception of the file name.
   */
  version(path, versionedPath) {
    assert.equal(dirname(path), dirname(versionedPath));
    const previously = this.#versionedPaths.get(path);
    if (previously) {
      if (versionedPath !== previously) {
        throw new Error(
          `path "${path}" is already versioned as "${versionedPath}"`
        );
      }
    } else {
      this.#versionedPaths.set(path, versionedPath);
    }
  }

  /** Look up the versioned alternative for the given path. */
  versioned(path) {
    return this.#versionedPaths.get(path);
  }

  /**
   * Create a regular expression that matches all paths (in their original
   * form) that have been versioned.
   */
  matchOriginals() {
    return new RegExp(
      [...this.#versionedPaths.keys()].map(p => escapeRegex(p)).join('|'),
      'u'
    );
  }

  // ---------------------------------------------------------------------------

  toString() {
    return stringifyJson({ inventory: { '/': this.#root.toJSON() } }, null, 2);
  }
}
