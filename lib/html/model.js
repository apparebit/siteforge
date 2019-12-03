/* © 2019 Robert Grimm */

const { freeze } = Object;
const toCaseInsensitiveRegex = (...names) =>
  new RegExp('^(' + names.join('|') + ')$', 'iu');

// =============================================================================
// Attributes
// =============================================================================

/** HTMML Attributes and Their Values. */
export const Attribute = freeze({
  Boolean: toCaseInsensitiveRegex(
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
    'typemustmatch'
  ),

  /** Attributes with possibly more than one value, all separated by commas. */
  CommaSeparatedList: toCaseInsensitiveRegex(
    'accept',
    'coords',
    'media',
    'sizes',
    'srcset'
  ),

  /** Attributes that may be `on` and `off`. */
  OnOff: toCaseInsensitiveRegex('autocomplete'),

  /** Attributes that may be `true`, `false`, and `mixed` */
  Tristate: toCaseInsensitiveRegex('aria-checked', 'aria-pressed'),

  /** Attributes that may be `true` and `false`. */
  TrueFalse: toCaseInsensitiveRegex(
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
    'preserveAlpha'
  ),

  /** Attributes that may be `true`, `false`, and `undefined`. */
  TrueFalseUndefined: toCaseInsensitiveRegex(
    'aria-expanded',
    'aria-grabbed',
    'aria-hidden',
    'aria-selected'
  ),

  /** Attributes that may be `yes` and `no`. */
  YesNo: toCaseInsensitiveRegex('translate'),
});

// =============================================================================
// Elements
// =============================================================================

export const Element = freeze({
  Embedded: toCaseInsensitiveRegex(
    'audio',
    'canvas',
    'embed',
    'iframe',
    'img',
    'math',
    'object',
    'picture',
    'svg',
    'video'
  ),
  Form: toCaseInsensitiveRegex(
    'button',
    'fieldset',
    'img',
    'input',
    'label',
    'object',
    'output',
    'select',
    'textarea'
  ),
  Heading: toCaseInsensitiveRegex('h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup'),
  Interactive: toCaseInsensitiveRegex(
    'button',
    'details',
    'embed',
    'iframe',
    'label',
    'select',
    'textarea'
  ),
  MetaData: toCaseInsensitiveRegex(
    'base',
    'link',
    'meta',
    'noscript',
    'script',
    'style',
    'template',
    'title'
  ),
  ScriptSupporting: toCaseInsensitiveRegex('script', 'template'),
  Sectioning: toCaseInsensitiveRegex('article', 'aside', 'nav', 'section'),
  SectioningRoots: toCaseInsensitiveRegex(
    'blockquote',
    'body',
    'details',
    'dialog',
    'fieldset',
    'figure',
    'td'
  ),
  Void: toCaseInsensitiveRegex(
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
    'wbr'
  ),
});
