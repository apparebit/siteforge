/* © 2019 Robert Grimm */

const AttributeTypes = [
  [
    'Boolean',
    [
      'allowfullscreen',
      'allowpaymentrequest',
      'async',
      'autofocus',
      'autoplay',
      'checked',
      'controls',
      'default',
      'defer',
      'disabled',
      'formnovalidate',
      'hidden',
      'ismap',
      'itemscope',
      'loop',
      'multiple',
      'muted',
      'nomodule',
      'novalidate',
      'open',
      'playsinline',
      'readonly',
      'required',
      'reversed',
      'selected',
      'typemustmatch',
    ],
  ],
  ['CommaSeparatedList', ['accept', 'coords', 'media', 'sizes', 'srcset']],
  ['OnOff', ['autocomplete']],
  [
    'TrueFalse',
    [
      // HTML
      'contenteditable',
      'draggable',
      'spellcheck',

      // ARIA
      'aria-atomic',
      'aria-busy',
      'aria-disabled',
      'aria-modal',
      'aria-multiline',
      'aria-multiselectable',
      'aria-readonly',
      'aria-required',

      // SVG
      'externalResourcesRequired',
      'preserveAlpha',
    ],
  ],
  ['TrueFalseMixed', ['aria-checked', 'aria-pressed']],
  [
    'TrueFalseUndefined',
    ['aria-expanded', 'aria-grabbed', 'aria-hidden', 'aria-selected'],
  ],
  ['YesNo', ['translate']],
].reduce((map, [type, names]) => {
  for (const name of names) {
    map.set(name, type);
  }
  return map;
}, new Map());

const InternalProperties = new Set(['type', 'children']);
export const isInternalProp = name => InternalProperties.has(name);
export const typeAttribute = name => AttributeTypes.get(name);

// -----------------------------------------------------------------------------

const AttributeNeedsQuoting = /[\t\n\f\r "&'=<>`]/gu;
const AttributeNeedsEscaping = /["&'<>`]/gu;
const HtmlNeedsEscaping = /["&'<>]/gu;
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
    ? `"${value.replace(AttributeNeedsEscaping, c => Escapes[c])}"`
    : value;
};

export const escapeText = text => {
  return text.replace(HtmlNeedsEscaping, c => Escapes[c]);
};

// -----------------------------------------------------------------------------

const VoidElement = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export const isVoidElement = name => VoidElement.has(name);

// -----------------------------------------------------------------------------

const RawText = new Set(['script', 'style', 'textarea', 'title']);
const RawTextRegex = {};

export const hasRawText = name => RawText.has(name);
export const isValidRawText = (tag, text) => {
  if (!RawText.has(tag)) {
    return true;
  } else if (!RawTextRegex[tag]) {
    RawTextRegex[tag] = new RegExp(`</${tag}[\\t\\n\\f\\r >/]`, 'u');
  }
  return !RawTextRegex[tag].test(text);
};

// -----------------------------------------------------------------------------

export const isValidComment = text =>
  !text.startsWith('>') &&
  !text.startsWith('->') &&
  !/<!--|-->|--!>/u.test(text) &&
  !text.endsWith('<!-');
