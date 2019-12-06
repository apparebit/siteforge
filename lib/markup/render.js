/* © 2019 Robert Grimm */

import { normalizeChildren, tagName } from './vdom.js';
import {
  escapeAttribute,
  escapeText,
  hasRawText,
  isInternalProp,
  isValidRawText,
  isVoidElement,
  typeAttribute,
} from './spec.js';
import Sq from '../tooling/sequitur.js';

const CLOSE = Symbol('close');
const MAX_RENDER_DEPTH = 50;
const NODE = Symbol('node');
const SVG_OFF = Symbol('svg-off');
const TEXT = Symbol('text');

const renderAttribute = ([name, value]) => {
  const type = typeAttribute(name);
  if (value == null) return '';

  switch (type) {
    case 'Boolean':
      return value ? ` ${name}` : '';
    case 'OnOff':
      return ` ${name}=${value ? 'on' : 'off'}`;
    case 'TrueFalse':
      return ` ${name}=${value ? 'true' : 'false'}`;
    case 'TrueFalseMixed':
      if (/^mixed$/iu.test(value)) return ` ${name}=mixed`;
      return ` ${name}=${value ? 'true' : 'false'}`;
    case 'TrueFalseUndefined':
      // Since undefined is the default, there is no need to render it.
      if (/^undefined$/iu.test(value)) return '';
      return ` ${name}=${value ? 'true' : 'false'}`;
    case 'YesNo':
      return ` ${name}=${value ? 'yes' : 'no'}`;
    default:
      if (Sq.isNonStringIterable(value)) {
        return ` ${name}=${escapeAttribute(
          Sq.from(value)
            .flatten()
            .filter(el => el != null)
            .join(type === 'CommaSeparatedList' ? ',' : ' ')
        )}`;
      } else {
        return ` ${name}=${escapeAttribute(String(value))}`;
      }
  }
};

export default function* render(
  node,
  {
    context = {},
    elementHooks = {},
    // FIXME A pretty printing option to indent lines would be good.
    renderChildren = true,
    renderComponents = true,
    renderReducedSpacing = true,
  } = {}
) {
  // Stack, not queue (!), of pending instructions. By executing them first-in,
  // first-out this function emits HTML markup strictly in document order.
  const pending = [{ opcode: NODE, parent: {}, node }];
  const enqueue = (parent, children) => {
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index];
      if (typeof child === 'string') {
        pending.push({ opcode: TEXT, parent, text: child });
      } else {
        pending.push({ opcode: NODE, parent, node: child });
      }
    }
  };

  const original = tagName(node);
  let isProcessingSVG = false;

  while (pending.length) {
    const instruction = pending.pop();
    const { opcode } = instruction;

    if (opcode === TEXT) {
      const { parent, text } = instruction;

      if (hasRawText(parent.type)) {
        if (isValidRawText(text)) {
          yield text;
        } else {
          throw new Error(
            `raw text for "${parent.type}" contains invalid character sequence`
          );
        }
      } else {
        yield escapeText(
          renderReducedSpacing ? text.replace(/\s+/gu, ' ') : text
        );
      }
    } else if (opcode === NODE) {
      let { node } = instruction;
      let children;

      // Render view components
      let renderDepth = 0;
      while (renderComponents && typeof node.type === 'function') {
        renderDepth++;
        if (renderDepth > MAX_RENDER_DEPTH) {
          throw new Error(
            `component "${original}" recursively rendered other components ${MAX_RENDER_DEPTH} times without producing a view`
          );
        }

        let result = node.type(node, context);
        if (Sq.isNonStringIterable(result)) {
          result = [...result];
          enqueue(node, result.slice(1));
          node = result[0];
        } else {
          node = result;
        }
      }

      // Enable SVG handling by tracking the outermost <svg>.
      const tag = tagName(node);
      if (!isProcessingSVG && tag === 'svg') {
        isProcessingSVG = true;
        pending.push({ opcode: SVG_OFF });
      }

      // Invoke global per-element hook (if there is one).
      if (elementHooks[tag]) {
        node = elementHooks[tag](node);
      }

      // Format the opening tag (which may be self-closing).
      const atts = Sq.entries(node)
        .filter(([name]) => !isInternalProp(name))
        .map(renderAttribute) // FIXME Use canonical attribute names!
        .join();
      const isVoid = isVoidElement(tag);
      yield '<' + tag + atts + (isVoid ? ' /' : '') + '>';

      if (isVoid) {
        // Reject blatantly malformed HTML.
        if (children.length > 0) {
          throw new Error(`void element "${tag}" has children`);
        }
      } else {
        // Enqueue closing tag (if not void) and children (if existent).
        pending.push({ opcode: CLOSE, tag });
        enqueue(node, normalizeChildren(node.children));
      }
    } else if (opcode === CLOSE) {
      const { tag } = instruction;
      yield `</${tag}>`;
    } else if (opcode === SVG_OFF) {
      isProcessingSVG = false;
    } else {
      throw new Error(`unknown rendering opcode "${String(opcode)}"`);
    }
  }
}
