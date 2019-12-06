/* © 2019 Robert Grimm */

import {
  escapeAttribute,
  escapeText,
  hasRawText,
  isInternalProp,
  isValidComment,
  isValidRawText,
  isVoidElement,
  typeAttribute,
} from '../lib/markup/spec.js';

import {
  normalizeChildren,
  h,
  hasDisplay,
  tagName,
} from '../lib/markup/vdom.js';
import render from '../lib/markup/render.js';
import tap from 'tap';

tap.test('markup/render', t => {
  const props = { class: ['logo', 'positive'], role: 'presentation' };
  const logo = h('div', props, h('span'), h('span'), h('span'));
  t.strictEqual(
    [...render(logo)].join(''),
    `<div class="logo positive" role=presentation>` +
      `<span></span><span></span><span></span></div>`
  );
  t.end();
});

tap.test('markup/spec', t => {
  t.strictEqual(escapeAttribute(`totally-fine`), `totally-fine`);
  t.strictEqual(escapeAttribute(`totally fine`), `"totally fine"`);
  t.strictEqual(escapeAttribute(`totally & fine`), `"totally &amp; fine"`);

  t.strictEqual(escapeText(`Nothing to see here!`), `Nothing to see here!`);
  t.strictEqual(escapeText(`"'&'"`), `&#34;&#39;&amp;&#39;&#34;`);

  t.ok(hasRawText('script'));
  t.ok(hasRawText('style'));
  t.ok(hasRawText('textarea'));
  t.ok(hasRawText('title'));
  t.notOk(hasRawText('a'));
  t.notOk(hasRawText('p'));

  t.ok(isInternalProp('children'));
  t.ok(isInternalProp('type'));
  t.notOk(isInternalProp('href'));
  t.notOk(isInternalProp('title'));
  t.ok(isValidComment('This is a comment.'));

  t.notOk(isValidRawText('script', 'totally invalid! </script '));
  t.notOk(isValidRawText('style', 'totally invalid! </style '));
  t.ok(isValidRawText('code', 'totally not raw text </code '));
  t.ok(isValidRawText('textarea', 'This is some text in a textarea'));

  t.notOk(isValidComment('> This is not a valid comment.'));
  t.notOk(isValidComment('-> This is not a valid comment.'));
  t.notOk(isValidComment('This is not a valid comment. <!-'));
  t.notOk(isValidComment('This is not <!-- a valid comment.'));
  t.notOk(isValidComment('This is not --> a valid comment.'));
  t.notOk(isValidComment('This is not --!> a valid comment.'));

  t.ok(isVoidElement('hr'));
  t.ok(isVoidElement('img'));
  t.ok(isVoidElement('meta'));
  t.notOk(isVoidElement('h4'));
  t.notOk(isVoidElement('a'));
  t.notOk(isVoidElement('p'));

  t.strictEqual(typeAttribute('contenteditable'), 'TrueFalse');
  t.strictEqual(typeAttribute('media'), 'CommaSeparatedList');
  t.strictEqual(typeAttribute('hidden'), 'Boolean');
  t.strictEqual(typeAttribute('aria-hidden'), 'TrueFalseUndefined');

  t.end();
});

tap.test('markup/vdom', t => {
  const props = { class: ['logo', 'positive'], role: 'presentation' };
  const logo = h('div', props, h('span'), h('span'), h('span'));
  t.strictEqual(logo, props);
  t.strictEqual(logo.type, 'div');
  t.strictSame(logo.children, Array(3).fill(h('span')));

  t.strictEqual(tagName(logo), 'div');
  t.strictEqual(tagName(logo.children[0]), 'span');

  t.notOk(hasDisplay());
  t.notOk(hasDisplay(null));
  t.notOk(hasDisplay(false));
  t.notOk(hasDisplay(true));
  t.notOk(hasDisplay(''));
  t.ok(hasDisplay(665));
  t.ok(hasDisplay('Off the Mark'));
  t.ok(hasDisplay({}));

  t.strictSame(normalizeChildren(), []);
  t.strictSame(normalizeChildren(null), []);
  t.strictSame(normalizeChildren([]), []);
  t.strictSame(normalizeChildren([[[[[[[]]]]]], [[[[[]]]]]]), []);
  t.strictSame(normalizeChildren(['Hello,', ' ', 'world!']), ['Hello, world!']);
  t.strictSame(normalizeChildren(['66', null, false, 5, {}, 4, 2]), [
    '665',
    {},
    '42',
  ]);

  t.end();
});
