/* © 2019-2020 Robert Grimm */

import { html, render } from '@grr/proact';

import {
  h,
  isComponent,
  isInternalChild,
  isInternalProperty,
  isTextualChild,
  Opcode,
  tag,
  traverse,
} from '@grr/proact/vdom';

import {
  escapeAttribute,
  escapeText,
  isValidComment,
  isValidRawText,
} from '@grr/proact/render';

import harness from './harness.js';
import Model from '@grr/html';

const answer = [
  null,
  undefined,
  true,
  false,
  'And the answer',
  null,
  false,
  ' is   ',
  [[[[42]]]],
  '!',
];
const ultimate = h('span', null, answer);
const theQuestion = h('div', { class: 'highlight' }, ultimate);

// =============================================================================

harness.test('@grr/proact', t => {
  t.test('h', async t => {
    const props = { class: ['logo', 'positive'], role: 'presentation' };
    const logo = h('div', props, h('span'), h('span'), h('span'));
    t.strictSame(logo, {
      ...props,
      type: 'div',
      children: Array(3).fill(h('span')),
    });
    t.equal(logo.type, 'div');
    t.strictSame(logo.children, Array(3).fill(h('span')));

    t.equal(tag(logo), 'div');
    t.equal(tag(logo.children[0]), 'span');
    t.equal(tag(h(() => {})), 'ViewComponent');

    t.ok(isInternalProperty('children'));
    t.ok(isInternalProperty('type'));
    t.notOk(isInternalProperty('cite'));

    t.ok(isInternalChild());
    t.ok(isInternalChild(null));
    t.ok(isInternalChild(false));
    t.ok(isInternalChild(true));
    t.ok(isInternalChild(''));
    t.notOk(isInternalChild(665));
    t.notOk(isInternalChild('Off the Mark'));
    t.notOk(isInternalChild({}));

    t.notOk(isTextualChild());
    t.notOk(isTextualChild(true));
    t.notOk(isTextualChild({}));
    t.ok(isTextualChild(665));
    t.ok(isTextualChild(42n));
    t.ok(isTextualChild('w00t'));

    t.notOk(isComponent());
    t.notOk(isComponent(true));
    t.notOk(isComponent(665));
    t.notOk(isComponent({}));
    t.ok(isComponent({ type: () => {} }));

    const steps = [];
    for await (const step of traverse(theQuestion)) {
      steps.push(step);
    }

    t.strictSame(steps, [
      {
        code: Opcode.EnterNode,
        parent: undefined,
        node: theQuestion,
      },
      { code: Opcode.EnterNode, parent: 'div', node: ultimate },
      {
        code: Opcode.Text,
        parent: 'span',
        node: 'And the answer is   42!',
      },
      {
        code: Opcode.ExitNode,
        parent: 'div',
        node: ultimate,
      },
      {
        code: Opcode.ExitNode,
        parent: undefined,
        node: theQuestion,
      },
    ]);

    t.end();
  });

  // ---------------------------------------------------------------------------

  t.test('html', t => {
    t.same(html` <div class="highlight"></div> `, [
      ' ',
      {
        type: 'div',
        class: 'highlight',
        children: [],
      },
      ' ',
    ]);

    t.same(
      html` <div class="highlight"><span>The answer is 42!</span></div> `,
      [
        ' ',
        {
          type: 'div',
          class: 'highlight',
          children: [{ type: 'span', children: ['The answer is 42!'] }],
        },
        ' ',
      ]
    );

    t.end();
  });

  // ---------------------------------------------------------------------------

  t.test('render', async t => {
    t.equal(escapeAttribute(`totally-fine`), `totally-fine`);
    t.equal(escapeAttribute(`totally fine`), `"totally fine"`);
    t.equal(escapeAttribute(`totally & fine`), `"totally &amp; fine"`);

    t.equal(escapeText(`Nothing to see here!`), `Nothing to see here!`);
    t.equal(escapeText(`"'<&>'"`), `"'&lt;&amp;&gt;'"`);

    t.ok(isValidComment('This is a comment.'));

    t.notOk(isValidRawText('script', 'totally invalid! </script '));
    t.notOk(isValidRawText('style', 'totally invalid! </style '));
    t.notOk(isValidRawText('code', 'totally not raw text </code '));
    t.ok(isValidRawText('textarea', 'This is some text in a textarea'));

    t.notOk(isValidComment('> This is not a valid comment.'));
    t.notOk(isValidComment('-> This is not a valid comment.'));
    t.notOk(isValidComment('This is not a valid comment. <!-'));
    t.notOk(isValidComment('This is not <!-- a valid comment.'));
    t.notOk(isValidComment('This is not --> a valid comment.'));
    t.notOk(isValidComment('This is not --!> a valid comment.'));

    const model = await Model.default();
    const fragments = [];
    for await (const fragment of render(theQuestion, { model })) {
      fragments.push(fragment);
    }

    t.equal(
      fragments.join(''),
      '<div class=highlight><span>And the answer is 42!</span></div>'
    );

    fragments.length = 0;
    for await (const fragment of render(
      // prettier-ignore
      html`<div class="highlight"><span>And the answer is 42!</span></div>`
    )) {
      fragments.push(fragment);
    }

    t.equal(
      fragments.join(''),
      '<div class=highlight><span>And the answer is 42!</span></div>'
    );

    t.end();
  });

  t.end();
});
