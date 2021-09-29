/* © 2020 Robert Grimm */

import {
  classify,
  hasPhase,
  isDefaultAssetPath,
  toCanonicalExtension,
} from './kind.js';
import { posix } from 'path';
import { escapeRegex, slugify } from '@grr/oddjob/string';
import { strict as assert } from 'assert';

const { assign, create, defineProperties } = Object;
const { dirname, isAbsolute, join, parse, relative } = posix;
const configurable = true;
const enumerable = true;
const { iterator } = Symbol;
const LA_FLOR = Symbol('secret');
const { stringify: stringifyJson } = JSON;

// =============================================================================

class File {
  constructor({ path, coolPath, kind, ...data }) {
    assign(this, data);
    defineProperties(this, {
      path: { configurable, enumerable, value: path },
      coolPath: { configurable, enumerable, value: coolPath },
      kind: { configurable, enumerable, value: kind },
    });
  }

  toString() {
    let kind = this.kind.toLowerCase();
    if (kind.startsWith('computed')) kind = `computed ${kind.slice(8)}`;
    return `File(${kind} ${this.path})`;
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
    {
      fillInMissingSegments = false,
      validateLastSegment = false,
      deleteLastSegment = false,
    } = {}
  ) {
    assert.ok(!isAbsolute(path), 'path must be relative');

    const segments = path.split('/');

    let cursor = this;
    for (let index = 0; index < segments.length; index++) {
      const name = segments[index];

      if (cursor.#entries.has(name)) {
        const entry = cursor.#entries.get(name);
        const last = index === segments.length - 1;

        if (last && deleteLastSegment) {
          cursor.#entries.delete(name);
          cursor = entry;
        } else if (
          entry instanceof Directory ||
          (last && !validateLastSegment)
        ) {
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

  _add(secret, name, { coolPath, kind, ...data } = {}) {
    assert.equal(secret, LA_FLOR, `Don't call me, I'll call you!`);
    assert.ok(name && typeof name === 'string');

    if (this.#entries.has(name)) {
      throw new Error(`directory "${this.#path}" already has entry "${name}"`);
    }

    const path = join(this.#path, name);
    const file = new File({ path, coolPath, kind, ...data });
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
  #size = 0;
  #root = new Directory();
  #byKind = new Map();
  #byKeyword = new Map();
  #versionedPaths = new Map();
  #isStaticAsset;
  #justCopy;

  constructor({
    isStaticAsset = isDefaultAssetPath,
    justCopy = () => false,
  } = {}) {
    this.#isStaticAsset = isStaticAsset;
    this.#justCopy = justCopy;
  }

  get size() {
    return this.#size;
  }

  /**
   * Add a file with the given path and optional properties. Intermediate
   * directories are automatically generated as necessary.
   */
  add(path, data = create(null)) {
    // We'd like to create a file object...
    assert.ok(isAbsolute(path), 'path must be absolute');
    let { dir, base, name, ext } = parse(path);

    // ...with canonical extension.
    const extsup = toCanonicalExtension(ext);
    if (extsup !== ext) {
      ext = extsup;
      base = name + ext;
      path = join(dir, base);
    }

    // ...with the appropriate parent directory object
    let parent = this.#root;
    if (dir !== '/') {
      parent = parent.lookup(relative('/', dir), {
        fillInMissingSegments: true,
        validateLastSegment: true,
      });
    }

    // ...with the right cool path and kind
    const { coolPath, kind } = classify(join(dir, name + ext), {
      isStaticAsset: this.#isStaticAsset,
      justCopy: this.#justCopy,
    });

    const file = parent._add(LA_FLOR, base, { coolPath, kind, ...data });
    this.#size++;

    // Add file to kind index.
    let files;
    if (!this.#byKind.has(kind)) {
      files = new Map();
      this.#byKind.set(kind, files);
    } else {
      files = this.#byKind.get(kind);
    }
    files.set(path, file);

    return file;
  }

  /**
   * Delete the file system entity with the given path. If that is a directory,
   * the transitive closure of children are also deleted.
   */
  delete(path) {
    assert.ok(isAbsolute(path), 'path must be absolute');
    assert.ok(path !== '/', 'path must not be root "/"');

    path = relative('/', path);

    // Delete from primary index (byPath).
    const entry = this.#root.lookup(path, { deleteLastSegment: true });

    // Delete from secondary index (byKind).
    if (entry instanceof File) {
      this.#byKind.get(entry.kind).delete(entry.path);
    } else {
      assert.ok(entry instanceof Directory);
      for (const file of entry.files()) {
        this.#byKind.get(file.kind).delete(file.path);
      }
    }

    // Delete from secondary index (byKeyword).
    if (entry instanceof File) {
      if (entry.keywords && typeof entry.keywords[iterator] === 'function') {
        for (const keyword of entry.keywords) {
          const slug = slugify(keyword);
          if (this.#byKeyword.has(slug)) {
            this.#byKeyword.get(slug).files.delete(entry.path);
          }
        }
      }
    }

    // Done.
    return entry;
  }

  /**
   * Handle a file system change event as produced by
   * [chokidar](https://github.com/paulmillr/chokidar). If the change event is
   * for a file, return the corresponding file object from the inventory.
   */
  handleChange(event, path) {
    let entry;
    switch (event) {
      case 'add':
        entry = this.byPath(path);
        return entry ? entry : this.add(path);
      case 'addDir':
        // Nothing to do, since chokidar raises add events for all entries.
        return null;
      case 'change':
        return this.byPath(path);
      case 'unlink':
        return this.delete(path);
      case 'unlinkDir':
        this.delete(path);
        return null;
      default:
        return null;
    }
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
          const files = new Map();
          files.set(file.path, file);

          this.#byKeyword.set(slug, {
            keyword: slug,
            display: [keyword],
            files,
          });
        } else {
          const { display, files } = this.#byKeyword.get(slug);
          if (!display.includes(keyword)) display.push(keyword);
          if (!files.has(file.path)) files.set(file.path, file);
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
      const files = this.#byKind.get(kind);
      if (files) {
        yield* files.values();
      }
    }
  }

  /** Look up files by tool phase. */
  *byPhase(phase) {
    for (const [kind, files] of this.#byKind) {
      if (hasPhase(kind, phase)) yield* files.values();
    }
  }

  /** Get all keywords currently in use. */
  keywords() {
    return this.#byKeyword.keys();
  }

  /** Look up files by keyword. */
  byKeyword(keyword) {
    const slug = slugify(keyword);
    return this.#byKeyword.get(slug);
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
