/* © 2019 Robert Grimm */

import { isInternalProperty, Opcode, tag, traverse } from './vdom.js';
import Sq from '@grr/sequitur.js';

const { has } = Reflect;

// =============================================================================

const RawTextRegex = {
  script: null,
  style: null,
  textarea: null,
  title: null,
};

export const isValidRawText = (tag, text) => {
  if (!has(RawTextRegex, tag)) {
    return false;
  } else if (!RawTextRegex[tag]) {
    RawTextRegex[tag] = new RegExp(`</${tag}[\\t\\n\\f\\r >/]`, 'u');
  }
  return !RawTextRegex[tag].test(text);
};

export const isValidComment = text =>
  !text.startsWith('>') &&
  !text.startsWith('->') &&
  !/<!--|-->|--!>/u.test(text) &&
  !text.endsWith('<!-');

const AttributeNeedsQuoting = /[\t\n\f\r "&'=<>`]/gu;
const AttributeToBeEscaped = /["&'<>`]/gu;
const TextToBeEscaped = /["&'<>]/gu;
const Escapes = {
  '"': '&#34;',
  '&': '&amp;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
  '`': '&#96;', // Escape in attribute values only.
};

export const escapeAttribute = value => {
  return AttributeNeedsQuoting.test(value)
    ? `"${value.replace(AttributeToBeEscaped, c => Escapes[c])}"`
    : value;
};

export const escapeText = text => {
  return text.replace(TextToBeEscaped, c => Escapes[c]);
};

// =============================================================================

const renderAttribute = (name, value, elementSpec) => {
  const spec = elementSpec.attributeForName(name);
  const type = spec.instance || spec.effectiveInstance;
  if (value == null) return '';

  switch (type) {
    case 'boolean':
      return value ? ` ${name}` : '';
    case 'on/off':
      return ` ${name}=${value ? 'on' : 'off'}`;
    case 'true/false':
      return ` ${name}=${value ? 'true' : 'false'}`;
    case 'true/false/mixed':
      if (/^mixed$/iu.test(value)) return ` ${name}=mixed`;
      return ` ${name}=${value ? 'true' : 'false'}`;
    case 'true/false/undefined':
      // Since undefined is the default, there is no need to render it.
      if (/^undefined$/iu.test(value)) return '';
      return ` ${name}=${value ? 'true' : 'false'}`;
    case 'yes/no':
      return ` ${name}=${value ? 'yes' : 'no'}`;
    default:
      if (Sq.isNonStringIterable(value)) {
        if (!has(spec, 'separator')) {
          throw new Error(
            `Attribute "${name}" for "${elementSpec.name}" has invalid list value`
          );
        }

        return ` ${name}=${escapeAttribute(
          Sq.from(value)
            .flatten()
            .filter(el => el != null)
            .join(spec.separator === 'comma' ? ',' : ' ')
        )}`;
      } else {
        return ` ${name}=${escapeAttribute(String(value))}`;
      }
  }
};

// =============================================================================

// FIXME Consider adding an option for pretty-printing the HTML.
// FIXME Consider adding an option not to render view components.
// FIXME Consider adding a mechanism for run-away view components.

export default async function* render(
  node,
  model,
  {
    context = {},
    hooks = {},
    traverseChildren = true,
    collapseWhiteSpace = true,
  } = {}
) {
  for await (const step of traverse(node, {
    context,
    hooks,
    traverseChildren,
  })) {
    const { code, parent, node } = step;

    if (code === Opcode.Text) {
      if (model.hasRawText(parent.type)) {
        if (isValidRawText(node)) {
          yield node;
        } else {
          throw new Error(`Raw text "${node}" for "${parent.type}" is invalid`);
        }
      } else if (collapseWhiteSpace && parent.type !== 'pre') {
        yield escapeText(
          collapseWhiteSpace ? node.replace(/\s+/gu, ' ') : node
        );
      } else {
        yield escapeText(node);
      }
    } else if (code === Opcode.EnterNode) {
      const name = tag(node);
      const attributes = Sq.entries(node)
        .filter(([key, _]) => !isInternalProperty(key))
        .map(([key, value]) =>
          renderAttribute(key, value, model.elementForName(name))
        )
        .join();
      const isVoid = model.isVoid(node.type);
      yield '<' + name + attributes + (isVoid ? ' /' : '') + '>';

      // Check that void elements really are void.
      if (isVoid && node.children.length > 0) {
        throw new Error(`Void element "${tag}" has children`);
      }
    } else if (code === Opcode.ExitNode) {
      if (!model.isVoid(node.type)) {
        yield `</${node.type}>`;
      }
    }
  }
}