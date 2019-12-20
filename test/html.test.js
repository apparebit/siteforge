/* © 2019 Robert Grimm */

import { join } from 'path';
import { default as Model, prepareModelData } from '@grr/html';
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
    autocapitalizeInheriting: ['three'],
    embedded: ['one'],
    empty: ['one'],
    flow: ['one', 'two'],
    formAssociated: ['three'],
    heading: ['one'],
    interactive: ['one'],
    labelable: ['three'],
    listed: ['three'],
    metadata: ['one'],
    palpable: ['one', 'two'],
    phrasing: ['one', 'two'],
    rawText: ['one'],
    resettable: ['three'],
    scriptSupporting: ['one'],
    sectioning: ['one'],
    sectioningRoot: ['one'],
    submittable: ['three'],
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

tap.test('@grr/html', async t => {
  // Loading Model Data
  // ------------------

  t.rejects(
    () => Model.load(import.meta.url),
    /Could not load model data from ".*?"/u
  );

  t.rejects(
    () => Model.load(__package),
    /Property "categories" is missing from model data in ".*?"/u
  );

  t.throws(
    () => prepareModelData({ categories: 665 }),
    /Property "categories" is invalid for model data/u
  );

  let model = fakeModel();
  t.strictEqual(
    prepareModelData(model).elements.get('one').children.elements[0],
    'two'
  );

  delete model.categories.labelable;
  t.throws(
    () => prepareModelData(model),
    /Category "labelable" is missing from model data/u
  );

  t.throws(
    () =>
      prepareModelData({
        categories: {},
      }),
    /Categories "autocapitalizeInheriting", .*? and "void" are missing from model data/u
  );

  model = fakeModel();
  delete model.elements['*'];
  t.throws(
    () => prepareModelData(model),
    /Global attributes are missing from model data in ".*?"/u
  );

  // eslint-disable-next-line require-atomic-updates
  model = await Model.load();
  t.strictEqual(await Model.load(), model);

  // Simple Predicates on Attributes and Events
  // ------------------------------------------

  t.ok(model.isAriaAttribute('aria-hidden'));
  t.ok(model.isAriaAttribute('aria-totally-non-existent-invented-attribute'));
  t.ok(model.isAriaAttribute('role'));
  t.notOk(model.isAriaAttribute('href'));

  t.ok(model.isCustomData('data-data'));
  t.notOk(model.isCustomData('id'));

  t.ok(model.isGlobalAttribute('class'));
  t.ok(model.isGlobalAttribute('id'));
  t.ok(model.isGlobalAttribute('hidden'));
  t.notOk(model.isGlobalAttribute('enctype'));
  t.notOk(model.isGlobalAttribute('wheel'));

  t.ok(model.isEventHandler('onload'));
  t.ok(model.isEventHandler('onoffline'));
  t.ok(model.isEventHandler('ontotallynonexistentinventedevent'));
  t.notOk(model.isEventHandler('load'));
  t.ok(model.isEvent('load'));
  t.notOk(model.isEvent('onload'));
  t.ok(model.isWindowEvent('offline'));
  t.notOk(model.isWindowEvent('list'));

  // Element Categories
  // ------------------

  t.throws(
    () => model.hasCategory('h1', 'TheSupremeHeadline'),
    /Invalid category "TheSupremeHeadline"/u
  );

  t.ok(model.hasCategory('script', 'rawText'));
  t.ok(model.hasCategory('img', 'void'));
  t.ok(model.hasCategory('template', 'empty'));
  t.notOk(model.hasCategory('template', 'void'));
  t.notOk(model.hasCategory('span', 'metadata'));
  t.ok(model.hasCategory('output', 'autocapitalizeInheriting'));
  t.notOk(model.hasCategory('output', 'embedded'));
  t.notOk(model.hasCategory('output', 'empty'));
  t.ok(model.hasCategory('output', 'flow'));
  t.ok(model.hasCategory('output', 'formAssociated'));
  t.notOk(model.hasCategory('output', 'heading'));
  t.notOk(model.hasCategory('output', 'interactive'));
  t.ok(model.hasCategory('output', 'labelable'));
  t.ok(model.hasCategory('output', 'listed'));
  t.notOk(model.hasCategory('output', 'metadata'));
  t.ok(model.hasCategory('output', 'palpable'));
  t.ok(model.hasCategory('output', 'phrasing'));
  t.notOk(model.hasCategory('output', 'rawText'));
  t.ok(model.hasCategory('output', 'resettable'));
  t.notOk(model.hasCategory('output', 'scriptSupporting'));
  t.notOk(model.hasCategory('output', 'sectioning'));
  t.notOk(model.hasCategory('output', 'sectioningRoot'));
  t.notOk(model.hasCategory('output', 'submittable'));
  t.notOk(model.hasCategory('output', 'transparent'));
  t.notOk(model.hasCategory('output', 'void'));

  // Elements
  // --------

  t.throws(
    () => model.elementForName('notanelement'),
    /Invalid element name "notanelement"/u
  );

  const a = model.elementForName('a');
  t.strictEqual(model.elementForName('a'), a);
  t.strictEqual(a.constructor.name, 'Element');
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

  t.notOk(model.hasCategory('a', 'void'));
  t.notOk(a.isVoid());
  t.ok(model.hasCategory('hr', 'void'));
  t.ok(model.elementForName('hr').isVoid());
  t.ok(model.hasCategory('img', 'void'));
  t.ok(model.elementForName('img').isVoid());

  t.notOk(model.hasCategory('a', 'rawText'));
  t.notOk(a.hasRawText());
  t.ok(model.hasCategory('textarea', 'rawText'));
  t.ok(model.elementForName('textarea').hasRawText());
  t.ok(model.hasCategory('style', 'rawText'));
  t.ok(model.elementForName('style').hasRawText());

  // Looking up a child's model data

  t.throws(
    () => model.elementForName('img').child('a'),
    /Element <img> should not have children/u
  );

  t.strictEqual(model.elementForName('p').child('em').name, 'em');

  t.throws(
    () => a.child('em', 'img'),
    /Closest enclosing non-transparent element <img> should not have children/u
  );

  t.strictEqual(a.child('em', 'ins', 'p').name, 'em');

  t.throws(
    () => model.elementForName('h1').child('section'),
    /Element <section> is not a valid child for <h1>/u
  );

  t.throws(
    () => model.elementForName('ol').child('style'),
    /Element <style> is not a valid child for <ol>/u
  );

  // Looking up attributes

  t.strictEqual(a.attribute('data-data').instance, '*');
  t.strictEqual(a.attribute('onclick').instance, 'eventHandler');

  t.strictEqual(
    model.elementForName('body').attribute('onoffline').instance,
    'eventHandler'
  );

  t.throws(
    () => a.attribute('onoffline'),
    /Event handler "onoffline" is not a valid attribute on <a>/u
  );

  t.throws(
    () => model.elementForName('body').attribute('onclick'),
    /Event handler "onclick" is not a valid attribute on <body>/u
  );

  t.strictEqual(
    a.attribute('aria-hidden').effectiveInstance,
    'true/false/undefined'
  );
  t.strictEqual(a.attribute('class').separator, 'space');
  const href = a.attribute('href');
  t.strictEqual(href.instance, 'url');
  t.strictEqual(a.attribute('href'), href);

  t.throws(
    () => a.attribute('autoplay'),
    /Attribute "autoplay" is not a valid attribute on <a>/u
  );

  t.throws(
    () => a.attribute('aria-invented'),
    /Attribute "aria-invented" is undefined/u
  );

  t.strictSame(model.elementForName('form').attribute('autocomplete').tokens, [
    'off',
    'on',
  ]);

  const autocomplete = model.elementForName('input').attribute('autocomplete');
  t.notOk(autocomplete.tokens.includes('off'));
  t.notOk(autocomplete.tokens.includes('on'));

  // Attributes
  // ----------

  t.notOk(href.isMultivalued());
  t.ok(href.isInstance());
  t.notOk(href.isEnum());
  t.notOk(href.hasEnum('off'));

  t.notOk(autocomplete.isMultivalued());
  t.notOk(autocomplete.isInstance());
  t.ok(autocomplete.isEnum());
  t.ok(autocomplete.hasEnum('cc-additional-name'));
  t.ok(autocomplete.hasEnum('honorific-prefix'));
  t.ok(autocomplete.hasEnum('sex'));
  t.notOk(autocomplete.hasEnum('off'));
  t.notOk(autocomplete.hasEnum('on'));

  // Effective instance

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
    t.strictEqual(model.attributes.get(name).effectiveInstance, instance)
  );

  t.strictEqual(
    model.attributes.get('autocomplete').cases.form.effectiveInstance,
    'on/off'
  );

  t.end();
});
