/* © 2019 Robert Grimm */

import { isInternalProperty, Opcode, tag, traverse } from './vdom.js';
import Model from '@grr/html';

const { entries: entriesOf } = Object;
const { has } = Reflect;
const { isArray } = Array;

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
const TextToBeEscaped = /[&<>]/gu;
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

const renderAttribute = (name, value, spec) => {
  const { type } = spec;
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
      if (isArray(value)) {
        if (!has(spec, 'separator')) {
          throw new Error(`Attribute "${name}" has invalid list value`);
        }
        return ` ${name}=${escapeAttribute(
          value
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
  {
    context = {},
    hooks = {},
    model = Model.default(),
    traverseChildren = true,
    collapseWhiteSpace = true,
  } = {}
) {
  model = await model;
  const ancestors = [];

  for await (const step of traverse(node, {
    ancestors,
    context,
    hooks,
    traverseChildren,
  })) {
    const { code, parent, node } = step;

    if (code === Opcode.Text) {
      if (model.hasCategory(parent.type, 'rawText')) {
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
      const spec = model.elementForName(name);
      const attributes = [];
      for (const [key, value] of entriesOf(node)) {
        if (!isInternalProperty(key)) {
          const attributeSpec = spec.attribute(key, ancestors);
          attributes.push(renderAttribute(key, value, attributeSpec));
        }
      }
      const isVoid = model.hasCategory(node.type, 'void');
      yield '<' + name + attributes.join('') + (isVoid ? ' /' : '') + '>';

      // Check that void elements really are void.
      if (isVoid && node.children.length > 0) {
        throw new Error(`Void element "${tag}" has children`);
      }
    } else if (code === Opcode.ExitNode) {
      if (!model.hasCategory(node.type, 'void')) {
        yield `</${node.type}>`;
      }
    }
  }
}
