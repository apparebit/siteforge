/* © 2019 Robert Grimm */

import htm from 'htm';
import Sq from '../tooling/sequitur.js';

/**
 * Create a new node. This version of the core VDOM element constructor is a bit
 * unusual in that it does almost nothing. Notably, it only adds the `type` and
 * `children` to the `props` object instead of freshly allocating a new node.
 */
export const h = (type, props, ...children) => {
  props = Object(props);
  props.type = type;
  props.children = children;
  return props;
};

/** Parse a thusly tagged string template into the VDOM. */
export const html = htm.bind(h);

/** Determine the tag name for the node, which may be a view component. */
export const tagName = node =>
  node.type.displayName || node.type.name || node.type || '<nameless>';

const DisplayTypes = new Set(['bigint', 'number', 'object', 'string']);

/** Determine whether the value has an observable external representation. */
export const hasDisplay = child =>
  child != null && child !== '' && DisplayTypes.has(typeof child);

function* coalesceText(children) {
  const buffer = [];

  for (const child of children) {
    const type = typeof child;

    if (type !== 'object') {
      buffer.push(String(child));
      continue;
    }

    if (buffer.length) {
      yield buffer.join('');
      buffer.length = 0;
    }

    yield child;
  }

  if (buffer.length) {
    yield buffer.join('');
    buffer.length = 0;
  }
}

export const normalizeChildren = children =>
  Sq.from(children)
    .flatten()
    .filter(hasDisplay)
    .run(coalesceText)
    .collect();
