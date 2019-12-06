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

const MAX_RENDER_DEPTH = 50;

const CLOSE = Symbol('close');
const NODE = Symbol('node');
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
    renderComponents = true,
    renderChildren = true,
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
        yield escapeText(text);
      }
    } else if (opcode === NODE) {
      let { node } = instruction;
      let children;

      // Render View Components
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

      // Invoke Global Per-Element Hook
      const tag = tagName(node);
      if (elementHooks[tag]) {
        node = elementHooks[tag](node);
      }

      // Format the Tag
      const atts = Sq.entries(node)
        .filter(([name]) => !isInternalProp(name))
        .map(renderAttribute)
        .join();
      const isVoid = isVoidElement(tag);
      yield '<' + tag + atts + (isVoid ? ' /' : '') + '>';
      pending.push({ opcode: CLOSE, tag });

      // Enqueue children
      if (isVoid && children.length > 0) {
        throw new Error(`void element "${tag}" has children`);
      } else if (!isVoid && renderChildren) {
        enqueue(node, normalizeChildren(node.children));
      }
    } else if (opcode === CLOSE) {
      const { tag } = instruction;
      yield `</${tag}>`;
    } else {
      throw new Error(`unknown rendering opcode "${String(opcode)}"`);
    }
  }
}
