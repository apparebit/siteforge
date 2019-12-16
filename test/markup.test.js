/* © 2019 Robert Grimm */

import {
  default as render,
  escapeAttribute,
  escapeText,
  isValidComment,
  isValidRawText,
} from '../source/markup/render.js';
import { join } from 'path';
import { default as Model, prepareModelData } from '../source/markup/model.js';
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
import { toDirectory } from '../source/tooling/fs.js';

const __directory = toDirectory(import.meta.url);
const __package = join(__directory, '../package.json');

const fakeModel = () => ({
  attributes: {
    atta: {
      instance: 'url',
    },
    attb: {
      tokens: ['B'],
    },
  },
  categories: {
    embedded: ['one'],
    flow: ['one', 'two'],
    formAssociated: ['one'],
    heading: ['one'],
    interactive: ['one'],
    labelable: ['one'],
    metadata: ['one'],
    palpable: ['one', 'two'],
    phrasing: ['one', 'two'],
    rawText: ['one'],
    scriptSupporting: ['one'],
    sectioning: ['one'],
    sectioningRoots: ['one'],
    transparent: ['one'],
    void: ['one'],
  },
  elements: {
    '*': {
      attributes: ['atta'],
    },
    one: {
      attributes: ['attb'],
      children: {
        elements: ['two'],
      },
    },
    two: {
      children: {
        category: 'phrasing',
      },
    },
  },
  events: {
    '*': ['bang', 'boom', 'pft'],
    window: ['klirr'],
  },
});

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

tap.test('markup/model', async t => {
  // >>> Loading and Validating Model Data

  t.rejects(
    () => Model.load(import.meta.url),
    /Could not load model data from ".*?"/u
  );
  t.rejects(
    () => Model.load(__package),
    /Property "categories" missing from model data in ".*?"/u
  );

  t.throws(
    () => prepareModelData({ categories: 665 }),
    /Property "categories" invalid for model data/u
  );

  let model = fakeModel();
  t.strictEqual(
    prepareModelData(model).elements.get('one').children.elements[0],
    'two'
  );
  delete model.categories.labelable;
  t.throws(
    () => prepareModelData(model),
    /Category "labelable" missing from model data/u
  );

  t.throws(
    () =>
      prepareModelData({
        categories: {},
      }),
    /Categories "embedded", "flow", .*? and "void" missing from model data/u
  );

  model = fakeModel();
  delete model.elements['*'];
  t.throws(
    () => prepareModelData(model),
    /Global attributes missing from model data in ".*?"/u
  );

  // eslint-disable-next-line require-atomic-updates
  model = await Model.load();
  t.strictEqual(await Model.load(), model);

  // >>> Properties of Attributes

  t.ok(model.isARIALike('aria-hidden'));
  t.ok(model.isARIALike('role'));
  t.notOk(model.isARIALike('href'));

  t.ok(model.isCustomDataLike('data-data'));
  t.notOk(model.isCustomDataLike('id'));

  t.ok(model.isGlobalAttribute('class'));
  t.ok(model.isGlobalAttribute('id'));
  t.ok(model.isGlobalAttribute('hidden'));
  t.notOk(model.isGlobalAttribute('enctype'));
  t.notOk(model.isGlobalAttribute('wheel'));

  t.ok(model.isEventHandlerLike('onload'));
  t.notOk(model.isEventHandlerLike('load'));
  t.ok(model.isEvent('load'));
  t.notOk(model.isEvent('onload'));
  t.ok(model.isWindowEvent('offline'));
  t.notOk(model.isWindowEvent('list'));

  t.notOk(model.isEventHandler('loaded'));
  t.ok(model.isEventHandler('onload'));
  t.ok(model.isEventHandler('onoffline'));

  // >>> Categories of Elements

  t.throws(() => model.categoryForName('booboo'), /Unknown category "booboo"/u);
  const rawText = model.categoryForName('rawText');
  t.strictSame(rawText, new Set(['script', 'style', 'textarea', 'title']));
  t.ok(model.isElementInCategory('script', rawText));
  t.ok(model.isElementInCategory('style', 'rawText'));

  // >>> Properties of Elements

  t.throws(
    () => model.elementForName('notanelement'),
    /Unknown element "notanelement"/u
  );
  const a = model.elementForName('a');
  t.strictEqual(a.name, 'a');
  t.strictEqual(a.model, model);
  t.strictSame(a.attributes, [
    'download',
    'href',
    'hreflang',
    'ping',
    'referrerpolicy',
    'rel',
    'target',
    'type',
  ]);

  t.notOk(model.isVoid('a'));
  t.notOk(a.isVoid());
  t.ok(model.isVoid('hr'));
  t.ok(model.elementForName('hr').isVoid());
  t.ok(model.isVoid('img'));
  t.ok(model.elementForName('img').isVoid());

  t.ok(model.isTransparent('a'));
  t.ok(a.isTransparent());
  t.ok(model.isTransparent('ins'));
  t.ok(model.elementForName('ins').isTransparent());
  t.notOk(model.isTransparent('p'));
  t.notOk(model.elementForName('p').isTransparent());

  t.notOk(model.hasRawText('a'));
  t.notOk(a.hasRawText());
  t.ok(model.hasRawText('textarea'));
  t.ok(model.elementForName('textarea').hasRawText());
  t.ok(model.hasRawText('style'));
  t.ok(model.elementForName('style').hasRawText());

  // >>> Per-Element Attributes

  let spec = a.attributeForName('data-data');
  t.strictEqual(spec.instance, '*');

  spec = a.attributeForName('onload');
  t.strictEqual(spec.instance, 'eventHandler');
  t.throws(
    () => a.attributeForName('onoffline'),
    /Window event "offline" unavailable on "a"/u
  );
  t.throws(
    () => a.attributeForName('onevent'),
    /Unknown event handler "onevent"/u
  );

  spec = a.attributeForName('target');
  t.strictEqual(spec.instance, 'contextName');

  spec = a.attributeForName('type');
  t.strictEqual(spec.instance, 'contentType');

  t.throws(
    () => a.attributeForName('answer42'),
    /Unknown attribute "answer42"/u
  );

  t.throws(
    () => a.attributeForName('size'),
    /Attribute "size" is undefined on "a"/u
  );

  [
    ['aria-atomic', 'true/false'],
    ['aria-busy', 'true/false'],
    ['aria-checked', 'true/false/mixed'],
    ['aria-disabled', 'true/false'],
    ['aria-expanded', 'true/false/undefined'],
    ['aria-grabbed', 'true/false/undefined'],
    ['aria-hidden', 'true/false/undefined'],
    ['aria-modal', 'true/false'],
    ['aria-multiline', 'true/false'],
    ['aria-multiselectable', 'true/false'],
    ['aria-pressed', 'true/false/mixed'],
    ['aria-readonly', 'true/false'],
    ['aria-required', 'true/false'],
    ['aria-selected', 'true/false/undefined'],
    ['contenteditable', 'true/false'],
    ['draggable', 'true/false'],
    ['spellcheck', 'true/false'],
    ['translate', 'yes/no'],
  ].forEach(([name, instance]) =>
    t.strictEqual(model.attributeForName(name).effectiveInstance, instance)
  );

  t.strictEqual(
    model.attributeForName('autocomplete').cases.form.effectiveInstance,
    'on/off'
  );

  // >>> Per-Element Children

  t.notOk(model.elementForName('img').isValidChild('span'));
  t.ok(model.elementForName('dl').isValidChild('dt'));
  t.notOk(model.elementForName('dl').isValidChild('a'));
  t.ok(model.elementForName('dt').isValidChild('section'));
  t.notOk(model.elementForName('dt').isValidChild('base'));

  spec = model.elementForName('body').attributeForName('onoffline');
  t.strictEqual(spec.instance, 'eventHandler');

  t.end();
});

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
    { code: Opcode.EnterNode, parent: theQuestion, node: ultimate },
    {
      code: Opcode.Text,
      parent: ultimate,
      node: 'And the answer is   42!',
    },
    {
      code: Opcode.ExitNode,
      parent: theQuestion,
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
