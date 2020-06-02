/* © 2019-2020 Robert Grimm */

import harness from './harness.js';
import Model from '@grr/html';
import { readFile } from '@grr/fs';
import Schema from '@grr/html/schema';

const { parse: parseJSON } = JSON;

harness.test('@grr/html', async t => {
  t.test('schema', async t => {
    const file = new URL('../packages/html/model.json', import.meta.url);
    let data = parseJSON(await readFile(file, 'utf8'));
    try {
      data = Schema(data);
    } catch (x) {
      console.log(x.message);
    }
    void data;
    t.end();
  });

  // eslint-disable-next-line require-atomic-updates
  const model = await Model.default();
  t.equal(await Model.default(), model);

  t.test('basic predicates', t => {
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
    t.end();
  });

  t.test('categories', t => {
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
    t.end();
  });

  const a = model.elementForName('a');

  t.test('basic element properties', t => {
    t.throws(
      () => model.elementForName('notanelement'),
      /Invalid element name "notanelement"/u
    );

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
    t.end();
  });

  t.test('looking up nested elements', t => {
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

    t.end();
  });

  const href = a.attribute('href');
  const autocomplete = model.elementForName('input').attribute('autocomplete');

  t.test('looking up attributes', t => {
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

    t.notOk(autocomplete.enum.includes('off'));
    t.notOk(autocomplete.enum.includes('on'));

    t.end();
  });

  t.test('attribute properties', t => {
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

    t.end();
  });

  t.test('attribute types', t => {
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

  t.end();
});
