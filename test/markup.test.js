/* © 2019 Robert Grimm */

import {
  default as render,
  escapeAttribute,
  escapeText,
  isValidComment,
  isValidRawText,
} from '../source/markup/render.js';
import Model from '@grr/html';
import {
  isComponent,
  isInternalChild,
  isInternalProperty,
  isTextualChild,
  h,
  Opcode,
  tag,
  traverse,
} from '../source/markup/vdom.js';
import tap from 'tap';

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

tap.test('markup/vdom', async t => {
  const props = { class: ['logo', 'positive'], role: 'presentation' };
  const logo = h('div', props, h('span'), h('span'), h('span'));
  t.strictEqual(logo, props);
  t.strictEqual(logo.type, 'div');
  t.strictSame(logo.children, Array(3).fill(h('span')));

  t.strictEqual(tag(logo), 'div');
  t.strictEqual(tag(logo.children[0]), 'span');
  t.strictEqual(tag(h(() => {})), 'ViewComponent');

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

// =============================================================================

tap.test('markup/render', async t => {
  t.strictEqual(escapeAttribute(`totally-fine`), `totally-fine`);
  t.strictEqual(escapeAttribute(`totally fine`), `"totally fine"`);
  t.strictEqual(escapeAttribute(`totally & fine`), `"totally &amp; fine"`);

  t.strictEqual(escapeText(`Nothing to see here!`), `Nothing to see here!`);
  t.strictEqual(escapeText(`"'&'"`), `&#34;&#39;&amp;&#39;&#34;`);

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

  const model = await Model.load();
  const steps = [];
  for await (const step of render(theQuestion, model)) {
    steps.push(step);
  }

  t.strictEqual(
    steps.join(''),
    '<div class=highlight><span>And the answer is 42!</span></div>'
  );

  t.end();
});
