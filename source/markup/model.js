/* © 2019 Robert Grimm */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promises } from 'fs';
import Sq from '../tooling/sequitur.js';

const { assign, freeze } = Object;
const { has } = Reflect;
const ModelDotJSON = join(
  dirname(fileURLToPath(import.meta.url)),
  'model.json'
);
const { parse: parseJSON } = JSON;
const { readFile } = promises;

const AnyInstance = freeze({ instance: '*' });
const HandlerInstance = freeze({ instance: 'eventHandler' });

const CATEGORIES = [
  'embedded',
  'flow',
  'formAssociated',
  'heading',
  'interactive',
  'labelable',
  'metadata',
  'palpable',
  'phrasing',
  'rawText',
  'scriptSupporting',
  'sectioning',
  'sectioningRoots',
  'transparent',
  'void',
];

// =============================================================================
// Read In and Validate Model Data

export const readModelData = async path => {
  try {
    return parseJSON(await readFile(path, 'utf8'));
  } catch (x) {
    throw new Error(`Could not load model data from "${path}": ${x.message}`);
  }
};

const hasSameValues = (actual, ...expected) => {
  if (actual == null || actual.length !== expected.length) return false;
  for (let token of actual) {
    if (token.default) token = token.default;
    if (!expected.includes(token)) return false;
  }
  return true;
};

const patchEffectiveInstance = ([k, v]) => {
  if (v.cases) {
    Sq.entries(v.cases).each(patchEffectiveInstance);
  } else {
    if (hasSameValues(v.tokens, 'true', 'false')) {
      v.effectiveInstance = 'true/false';
    } else if (hasSameValues(v.tokens, 'yes', 'no')) {
      v.effectiveInstance = 'yes/no';
    } else if (hasSameValues(v.tokens, 'on', 'off')) {
      v.effectiveInstance = 'on/off';
    } else if (hasSameValues(v.tokens, 'true', 'false', 'mixed')) {
      v.effectiveInstance = 'true/false/mixed';
    } else if (hasSameValues(v.tokens, 'true', 'false', 'undefined')) {
      v.effectiveInstance = 'true/false/undefined';
    }
  }
  return [[k, v]];
};

export const prepareModelData = (data, path) => {
  const extractEntries = (prop, transform = entry => [entry]) => {
    const value = data[prop];
    if (!has(data, prop) || value == null) {
      throw new Error(
        `Property "${prop}" missing from model data in "${path}"`
      );
    } else if (typeof value !== 'object') {
      throw new Error(`Property "${prop}" invalid for model data in "${path}"`);
    }
    return Sq.entries(value)
      .filter(([k, _]) => k !== '//')
      .flatMap(transform)
      .collectEntries(new Map());
  };

  const categories = extractEntries('categories', ([k, v]) => [
    [k, new Set(v)],
  ]);

  const missing = Sq.from(CATEGORIES)
    .filter(name => !categories.has(name) || !categories.get(name).size)
    .collect();

  if (missing.length === 1) {
    throw new Error(
      `Category "${missing[0]}" missing from model data in "${path}"`
    );
  } else if (missing.length > 0) {
    throw new Error(
      `Categories ${missing
        .map((c, i) => (i === missing.length - 1 ? 'and ' : '') + `"${c}"`)
        .join(', ')} missing from model data in "${path}"`
    );
  }

  const elements = extractEntries('elements');
  const attributes = extractEntries('attributes', patchEffectiveInstance);
  const globalAttributes = new Set((elements.get('*') || {}).attributes || []);
  if (globalAttributes.size === 0) {
    throw new Error(`Global attributes missing from model data in "${path}"`);
  }
  elements.delete('*');
  const events = extractEntries('events');

  return {
    attributes,
    globalAttributes,
    elements,
    categories,
    events: new Set(events.get('*')),
    windowEvents: new Set(events.get('window')),
  };
};

const loadModel = async path => {
  const raw = await readModelData(path);
  const prepared = prepareModelData(raw, path);
  return new Model(prepared);
};

// =============================================================================
// Elements and Their Attributes

const elementCache = new Map();

class Element {
  static for(name, spec, model) {
    if (!elementCache.has(name)) {
      elementCache.set(name, new Element(name, spec, model));
    }
    return elementCache.get(name);
  }

  constructor(name, spec, model) {
    this.name = name;
    assign(this, spec);
    this.model = model;
  }

  isVoid() {
    return this.children == null;
  }

  isTransparent() {
    return this.model.transparent.has(this.name);
  }

  hasRawText() {
    return this.model.rawText.has(this.name);
  }

  isValidChild(name) {
    const { children } = this;
    if (children == null) return false;

    const { category, elements } = children;
    if (elements && elements.includes(name)) return true;
    return category && this.model.isElementInCategory(name, category);
  }

  attributeForName(name) {
    // model.attributes does not account for custom data and event handlers.
    if (this.model.isCustomDataLike(name)) {
      return AnyInstance;
    } else if (this.model.isEventHandlerLike(name)) {
      const event = name.slice(2);
      if (this.model.isEvent(event)) {
        return HandlerInstance;
      } else if (this.model.isWindowEvent(event)) {
        if (this.name === 'body') {
          return HandlerInstance;
        } else {
          throw new Error(
            `Window event "${name.slice(2)}" unavailable on "${this.name}"`
          );
        }
      } else {
        throw new Error(`Unknown event handler "${name}"`);
      }
    } else {
      let spec = this.model.attributes.get(name);
      if (spec == null) {
        throw new Error(`Unknown attribute "${name}"`);
      } else if (spec.cases != null) {
        if (spec.cases[this.name] != null) {
          spec = spec.cases[this.name];
        } else {
          spec = spec.cases['*'];
        }
      }

      // Make sure the attribute is valid for this element.
      if (!this.model.isARIALike(name) && !this.model.isGlobalAttribute(name)) {
        if (this.attributes == null || !this.attributes.includes(name)) {
          throw new Error(`Attribute "${name}" is undefined on "${this.name}"`);
        }
      }

      return spec;
    }
  }
}

// =============================================================================
// The Overall Model

let defaultModel;

export default class Model {
  static load(path = ModelDotJSON) {
    if (path !== ModelDotJSON) {
      return loadModel(path);
    }

    if (!defaultModel) {
      defaultModel = Promise.resolve().then(() => loadModel(path));
    }
    return defaultModel;
  }

  constructor(data) {
    assign(this, data);
    for (const name of ['rawText', 'transparent', 'void']) {
      this[name] = this.categories.get(name);
    }
  }

  // Attributes
  // ----------

  isARIALike(name) {
    return name.startsWith('aria-') || name === 'role';
  }

  isCustomDataLike(name) {
    return name.startsWith('data-');
  }

  isGlobalAttribute(name) {
    return this.globalAttributes.has(name);
  }

  isEventHandlerLike(name) {
    return name.startsWith('on');
  }

  isEvent(name) {
    return this.events.has(name);
  }

  isWindowEvent(name) {
    return this.windowEvents.has(name);
  }

  isEventHandler(name) {
    if (!this.isEventHandlerLike(name)) return false;
    const event = name.slice(2);
    return this.isEvent(event) || this.isWindowEvent(event);
  }

  attributeForName(name) {
    const spec = this.attributes.get(name);
    if (spec == null) throw new Error(`Unknown attribute "${name}"`);
    return spec;
  }

  // Elements
  // --------

  isVoid(name) {
    return this.void.has(name);
  }

  isTransparent(name) {
    return this.transparent.has(name);
  }

  hasRawText(name) {
    return this.rawText.has(name);
  }

  elementForName(name) {
    if (name.includes('-')) name = 'custom-element';
    const spec = this.elements.get(name);
    if (spec == null) throw new Error(`Unknown element "${name}"`);
    return Element.for(name, spec, this);
  }

  // Categories
  // ----------

  categoryForName(name) {
    const members = this.categories.get(name);
    if (members == null) throw new Error(`Unknown category "${name}"`);
    return members;
  }

  isElementInCategory(element, category) {
    if (typeof category === 'string') {
      category = this.categoryForName(category);
    }
    return category.has(element);
  }
}
