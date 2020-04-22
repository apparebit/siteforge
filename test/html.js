/* © 2019-2020 Robert Grimm */

import harness from './harness.js';
//import { join } from 'path';
import Model from '@grr/html';
//import { toDirectory } from '@grr/fs';

//const __directory = toDirectory(import.meta.url);
//const __package = join(__directory, '../package.json');

// const fakeModel = () => ({
//   attributes: {
//     atta: {
//       type: 'URL',
//     },
//     attb: {
//       enum: ['B'],
//     },
//   },
//   categories: {
//     autocapitalizeInheriting: ['three'],
//     embedded: ['one'],
//     empty: ['one'],
//     flow: ['one', 'two'],
//     formAssociated: ['three'],
//     heading: ['one'],
//     interactive: ['one'],
//     labelable: ['three'],
//     listed: ['three'],
//     metadata: ['one'],
//     palpable: ['one', 'two'],
//     phrasing: ['one', 'two'],
//     rawText: ['one'],
//     resettable: ['three'],
//     scriptSupporting: ['one'],
//     sectioning: ['one'],
//     sectioningRoot: ['one'],
//     submittable: ['three'],
//     transparent: ['one'],
//     void: ['one'],
//   },
//   elements: {
//     '*': {
//       attributes: ['atta'],
//     },
//     one: {
//       attributes: ['attb'],
//       content: {
//         elements: ['two'],
//       },
//     },
//     two: {
//       content: {
//         category: 'phrasing',
//       },
//     },
//   },
//   events: {
//     '*': ['bang', 'boom', 'pft'],
//     window: ['klirr'],
//   },
// });

harness.test('@grr/html', async t => {
  // Loading Model Data
  // ------------------

  // try {
  //   await Model.load(import.meta.url);
  //   t.fail('should throw');
  // } catch (x) {
  //   t.match(x.message, /Could not load model data from ".*?"/u);
  // }

  // try {
  //   await Model.load(__package);
  //   t.fail('should throw');
  // } catch (x) {
  //   t.match(
  //     x.message,
  //     /Property "categories" is missing from model data in ".*?"/u
  //   );
  // }

  // t.throws(
  //   () => prepareModelData({ categories: 665 }),
  //   /Property "categories" is invalid for model data/u
  // );

  // let model = fakeModel();
  // t.equal(
  //   prepareModelData(model).elements.get('one').content.elements[0],
  //   'two'
  // );

  // delete model.categories.labelable;
  // t.throws(
  //   () => prepareModelData(model),
  //   /Category "labelable" is missing from model data/u
  // );

  // t.throws(
  //   () =>
  //     prepareModelData({
  //       categories: {},
  //     }),
  //   /Categories "autocapitalizeInheriting", .*? and "void" are missing from model data/u
  // );

  // model = fakeModel();
  // delete model.elements['*'];
  // t.throws(
  //   () => prepareModelData(model),
  //   /Global attributes are missing from model data in ".*?"/u
  // );

  // eslint-disable-next-line require-atomic-updates
  const model = await Model.default();
  t.equal(await Model.default(), model);

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
  t.equal(model.elementForName('a'), a);
  t.equal(a.constructor.name, 'Element');
  t.equal(a.name, 'a');
  t.equal(a.model, model);
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
    () => model.elementForName('img').element('a'),
    /Element <img> has no content/u
  );

  t.equal(model.elementForName('p').element('em').name, 'em');

  t.throws(
    () => a.element('em', 'img'),
    /Closest non-transparent enclosing element <img> has no content/u
  );

  t.equal(a.element('em', 'ins', 'p').name, 'em');

  t.throws(
    () => model.elementForName('h1').element('section'),
    /Element <section> is not valid content for <h1>/u
  );

  t.throws(
    () => model.elementForName('ol').element('style'),
    /Element <style> is not valid content for <ol>/u
  );

  // Looking up attributes

  t.equal(a.attribute('data-data').type, '*');
  t.equal(a.attribute('onclick').type, 'EventHandler');

  t.equal(
    model.elementForName('body').attribute('onoffline').type,
    'EventHandler'
  );

  t.throws(
    () => a.attribute('onoffline'),
    /Event handler "onoffline" is not valid on <a>/u
  );

  t.throws(
    () => model.elementForName('body').attribute('onclick'),
    /Event handler "onclick" is not valid on <body>/u
  );

  t.equal(a.attribute('aria-hidden').type, 'TrueFalseUndefined');
  t.equal(a.attribute('class').separator, 'space');
  const href = a.attribute('href');
  t.equal(href.type, 'URL');
  t.equal(a.attribute('href'), href);

  t.throws(
    () => a.attribute('autoplay'),
    /Attribute "autoplay" is not valid on <a>/u
  );

  t.throws(
    () => a.attribute('aria-invented'),
    /Attribute "aria-invented" is undefined/u
  );

  const Attribute = a.attribute('class').constructor;
  t.strictSame(
    model.elementForName('form').attribute('autocomplete'),
    new Attribute('autocomplete', { type: 'OnOff' })
  );

  const autocomplete = model.elementForName('input').attribute('autocomplete');
  t.notOk(autocomplete.enum.includes('off'));
  t.notOk(autocomplete.enum.includes('on'));

  // Attributes
  // ----------

  t.notOk(href.isMultivalued());
  t.ok(href.hasType());
  t.notOk(href.hasEnum('off'));

  t.notOk(autocomplete.isMultivalued());
  t.notOk(autocomplete.hasType());
  t.ok(autocomplete.hasEnum('cc-additional-name'));
  t.ok(autocomplete.hasEnum('honorific-prefix'));
  t.ok(autocomplete.hasEnum('sex'));
  t.notOk(autocomplete.hasEnum('off'));
  t.notOk(autocomplete.hasEnum('on'));

  // Types that Used to be Enum

  [
    ['aria-atomic', 'TrueFalse'],
    ['aria-busy', 'TrueFalse'],
    ['aria-checked', 'TrueFalseMixed'],
    ['aria-disabled', 'TrueFalse'],
    ['aria-expanded', 'TrueFalseUndefined'],
    ['aria-grabbed', 'TrueFalseUndefined'],
    ['aria-hidden', 'TrueFalseUndefined'],
    ['aria-modal', 'TrueFalse'],
    ['aria-multiline', 'TrueFalse'],
    ['aria-multiselectable', 'TrueFalse'],
    ['aria-pressed', 'TrueFalseMixed'],
    ['aria-readonly', 'TrueFalse'],
    ['aria-required', 'TrueFalse'],
    ['aria-selected', 'TrueFalseUndefined'],
    ['contenteditable', 'TrueFalse'],
    ['draggable', 'TrueFalse'],
    ['spellcheck', 'TrueFalse'],
    ['translate', 'YesNo'],
  ].forEach(([name, instance]) =>
    t.equal(model.attributes.get(name).type, instance)
  );

  t.equal(model.attributes.get('autocomplete').cases.form.type, 'OnOff');

  t.end();
});
