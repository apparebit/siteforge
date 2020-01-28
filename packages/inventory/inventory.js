/* © 2020 Robert Grimm */

import { posix } from 'path';
import { promises } from 'fs';
import { runInNewContext } from 'vm';
import { strict } from 'assert';

const { assign } = Object;
const { extname, join, parse } = posix;
const FRONT_OPEN = /\s*(<!--.*?--!>\s*)?<script[^>]*>/u;
const FRONT_CLOSE = '</script>';
const { parse: parseJson } = JSON;
const { readFile } = promises;
const SLASH = '/'.charCodeAt(0);

class File {
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

  static kind(extension) {
    return (
      {
        '.css': 'style',
        '.data.js': 'data',
        '.gif': 'image',
        '.htm': 'markup',
        '.html': 'markup',
        '.jpg': 'image',
        '.jpeg': 'image',
        '.js': 'script',
        '.md': 'markup',
        '.png': 'image',
        '.txt': 'text',
        '.webmanifest': 'data',
        '.webp': 'image',
        '.woff': 'font',
        '.woff2': 'font',
      }[extension] || 'etc'
    );
  }

  #content;
  #extension;
  #kind;
  #path;
  #props;
  #source;

  constructor(path, properties) {
    strict.equal(typeof path, 'string');

    const { content, source } = properties;
    this.#content = content;
    this.#extension = File.extension(path);
    this.#kind = File.kind(this.#extension);
    this.#path = path;
    this.#source = source;
    this.#props = properties;
  }

  get content() {
    return this.#content;
  }

  get extension() {
    return this.#extension;
  }

  get kind() {
    return this.#kind;
  }

  get path() {
    return this.#path;
  }

  get source() {
    return this.#source;
  }

  async read(options = 'utf8') {
    // Options: add json encoding, which decays to utf8 for system call.
    let json = false;
    if (options === 'json') {
      options = 'utf8';
      json = true;
    } else if (options && options.encoding === 'json') {
      options.encoding = 'utf8';
      json = true;
    }

    // Actually read the file contents and post-process.
    let content = await readFile(this.#source, options);
    if (typeof content === 'string' && content.charCodeAt(0) === 0xfeff) {
      // Eliminate any byte order mark.
      content = content.slice(1);
    }
    if (json) {
      // Parse any JSON.
      content = parseJson(content);
    }

    // Done.
    this.#content = content;
    return content;
  }

  frontMatter() {
    strict.equal(typeof this.#content, 'string');
    const match = this.#content.match(FRONT_OPEN);
    if (match == null) return undefined;

    const start = match[0].length;
    const end = this.#content.indexOf(FRONT_CLOSE);
    if (end === -1) {
      throw new Error(`front matter for "${this.path}" has no closing tag`);
    }

    const metadata = runInNewContext(
      `(${this.#content.slice(start, end)})`,
      undefined, // sandbox
      {
        filename: this.path,
        displayErrors: true,
        contextCodeGeneration: {
          strings: false, // No eval()
          wasm: false, // No wasm
        },
      }
    );

    if (metadata == null || typeof metadata !== 'object') {
      throw new Error(`front matter for "${this.path}" is not an object`);
    }
    this.#content = this.#content.slice(end + FRONT_CLOSE.length).trim();
    assign(this, metadata);
    return metadata;
  }

  process(map) {
    this.#content = map(this.#content);
    return this;
  }
}

// -----------------------------------------------------------------------------

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
    if (path.charCodeAt(0) === SLASH) {
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
    if (this.#entries.has(name)) {
      throw new Error(
        `entry "${name}" in directory "${this.#path}" already exists`
      );
    }

    const file = new File(join(this.#path, name), data);
    this.#entries.set(name, file);
    this.#inventory.index(file);
    return file;
  }
}

// -----------------------------------------------------------------------------

export default class Inventory {
  static create() {
    return new Inventory();
  }

  #root;
  #byKind;

  constructor() {
    this.#root = new Directory(this);

    const init = () => new Map();
    this.#byKind = {
      data: init(),
      etc: init(),
      font: init(),
      image: init(),
      markup: init(),
      script: init(),
      style: init(),
      text: init(),
    };
  }

  get root() {
    return this.#root;
  }

  lookup(path, options) {
    return this.#root.lookup(path, options);
  }

  addFile(path, data = {}) {
    const { dir, base } = parse(path);
    return this.#root
      .lookup(dir, { fillInMissingSegments: true, validateLastSegment: true })
      .addFile(base, data);
  }

  index(file) {
    this.#byKind[file.kind].set(file.path, file);
    return this;
  }
}
