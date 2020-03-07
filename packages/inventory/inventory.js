/* © 2020 Robert Grimm */

import { isDefaultAssetPath, toKind, KIND } from './path.js';
import { posix } from 'path';
import { strict as assert } from 'assert';

const { assign, defineProperties } = Object;
const { dirname, isAbsolute, join, parse, relative } = posix;
const configurable = true;
const EMPTY_ARRAY = [];
const enumerable = true;
const LA_FLOR = Symbol('secret');
const { stringify: stringifyJson } = JSON;

// Popular copy pasta refined with local seasoning
// (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
const escapeRegex = literal => literal.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

// =============================================================================

class File {
  constructor(path, kind, data = {}) {
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

  get path() {
    return this.#path;
  }

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

  _add(secret, name, kind, data = {}) {
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
    const entries = {};
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
  #root = new Directory();
  #byKind = new Map();
  #versionedPaths = new Map();
  #isStaticAsset;

  constructor({ isStaticAsset = isDefaultAssetPath } = {}) {
    this.#isStaticAsset = isStaticAsset;
  }

  add(path, data = {}) {
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

    // Add file's path to secondary
    if (this.#byKind.has(kind)) {
      this.#byKind.get(kind).push(file);
    } else {
      this.#byKind.set(kind, [file]);
    }

    return file;
  }

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
      case 1:
        yield* this.#byKind.get(KIND.DATA) || EMPTY_ARRAY;
        break;
      case 2:
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
      case 3:
        yield* this.#byKind.get(KIND.CONTENT_SCRIPT) || EMPTY_ARRAY;
        yield* this.#byKind.get(KIND.MARKUP) || EMPTY_ARRAY;
        break;
      default:
        assert.fail('phase must be 1, 2, or 3');
    }
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
