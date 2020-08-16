/* © 2020 Robert Grimm */

// The syntax of valid JavaScript identifiers
const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*$/u;
const RESERVED = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

const configurable = true;
const { defineProperty, keys: keysOf } = Object;
const { isArray } = Array;

/**
 * Create a new template function. The function has the given `name` and returns
 * the result of evaluating the given `source` as a JavaScript template literal,
 * optionally prefixed by the given tag function bound to `tag.name`. In
 * addition to the optional binding for the tag function, the execution
 * environment for evaluating the template literal is determined by `library`,
 * whose properties provide the names and values of helper functionality, and
 * `data`, whose elements provide the names of data. The `library` parameter
 * might also be called `bindNow` and the `data` parameter might also be called
 * `bindOnCall`.
 */
const templatize = ({
  name = 'template',
  tag = undefined,
  library = {},
  data = [],
  source = '',
}) => {
  // Helper to check that all identifiers are valid and distinct.
  const identifiers = new Set();
  const check = (entity, value) => {
    if (
      typeof value !== 'string' ||
      !IDENTIFIER.test(value) ||
      RESERVED.has(value)
    ) {
      throw new TypeError(
        `Template ${entity} "${value}" is not a valid JavaScript identifier`
      );
    } else if (identifiers.has(value)) {
      throw new SyntaxError(`Identifier "${value}" has already been declared`);
    } else {
      identifiers.add(value);
    }
  };

  // Validate the arguments.
  check('name', name);

  const hasTag = tag != null;
  if (hasTag) {
    if (typeof tag !== 'function') {
      throw new TypeError(`Template tag "${tag}" is not a function`);
    }
    check(`tag's name`, tag.name);
  }

  const hasLibrary = library != null;
  let libraryNames;
  if (!hasLibrary) {
    libraryNames = [];
  } else {
    if (typeof library !== 'object') {
      throw new TypeError(`Template library "${library}" is not an object`);
    }
    libraryNames = keysOf(library);
    for (const binding of libraryNames) {
      check('library binding', binding);
    }
  }

  if (typeof data === 'string') {
    data = [data];
  } else if (!isArray(data)) {
    throw new TypeError(`Template data bindings "${data}" is not an array`);
  } else if (data.length === 0) {
    throw new SyntaxError(`Template data bindings are empty`);
  }
  for (const binding of data) {
    check('data binding', binding);
  }

  if (typeof source !== 'string') {
    throw new TypeError(`Template source "${source}" is not a string`);
  }

  //----------------------------------------------------------------------------

  const innards = [];
  if (hasTag) {
    innards.push(tag.name);
  }
  if (hasLibrary) {
    innards.push(`{ ${libraryNames.join(', ')} }`);
  }
  innards.push(`{ ${data.join(', ')} }`);
  innards.push(`return ${hasTag ? tag.name : ''}\`${source}\`;`);

  // eslint-disable-next-line no-new-func
  let template = new Function(...innards);

  const bindings = [null];
  if (hasTag) {
    bindings.push(tag);
  }
  if (hasLibrary) {
    bindings.push(library);
  }

  template = template.bind(...bindings);

  defineProperty(template, 'name', {
    configurable,
    value: name,
  });

  return template;
};

export default templatize;
