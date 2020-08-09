/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { escapeText } from '@grr/html/syntax';

const configurable = true;
const { defineProperty } = Object;
const { isArray } = Array;

// -----------------------------------------------------------------------------

const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*$/u;

/**
 * Create a new template function. The newly created function has the given name
 * and a single parameter, which is called `data` by default. When invoked, the
 * function returns the result of evaluating a JavaScript template literal with
 * the given text, which includes placeholder expressions. If the given bindings
 * are not empty, the template function destructures its only argument into the
 * bindings instead of defining `data`. In either case, `escape` binds the given
 * textual escaping function. To put it differently, the `bindings` and `escape`
 * define the public API to the template.
 */
const templatize = ({
  bindings = [],
  escape = escapeText,
  name = 'template',
  source = '',
}) => {
  // This function returns a function. That makes validation more important.
  if (typeof bindings === 'string') bindings = [bindings];
  assert(isArray(bindings));
  if (bindings.length) {
    for (const binding of bindings) {
      assert(
        typeof binding === 'string' &&
          IDENTIFIER.test(binding) &&
          binding !== 'escape',
        'binding must be a valid JavaScript identifier'
      );
    }
  }
  assert(typeof escape === 'function');
  assert(typeof name === 'string');
  assert(typeof source === 'string');

  // Instantiate the bindings of the template through parameter destructuring.
  let data;
  if (bindings.length) {
    data = `{ ${[...new Set(bindings)].join(', ')} } = {}`;
  } else {
    data = 'data';
  }

  // The template body is trivial.
  const body = `return \`${source}\`;`;

  // But passing live values requires the power of Function.prototype.bind.
  // eslint-disable-next-line no-new-func
  const fn = new Function('escape', data, body).bind(null, escape);

  // Meaningful names help with introspection, including for debugging.
  defineProperty(fn, 'name', {
    configurable,
    value: name,
  });

  return fn;
};

export default templatize;
