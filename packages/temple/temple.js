/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';

const configurable = true;
const { defineProperty } = Object;

// -----------------------------------------------------------------------------

const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*$/u;
const SLASH_TICK = /[\\`]/gu;

export const templatize = ({ bindings = [], name = 'template', text = '' }) => {
  let body = '  return `' + text.replace(SLASH_TICK, '\\$&') + '`;';

  if (bindings.length) {
    for (const binding of bindings) {
      assert(
        typeof binding === 'string' && IDENTIFIER.test(binding),
        'binding must be a valid JavaScript identifier'
      );
    }
    body = `  const { ${[...new Set(bindings)].join(', ')} } = data;\n${body}`;
  }

  // eslint-disable-next-line no-new-func
  const fn = new Function('data', body);
  defineProperty(fn, 'name', {
    configurable,
    value: name,
  });
  return fn;
};
