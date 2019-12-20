/* © 2019 Robert Grimm */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promises } from 'fs';
import Sq from '@grr/sequitur';

const { assign } = Object;
const { has } = Reflect;
const ModelDotJSON = join(
  dirname(fileURLToPath(import.meta.url)),
  'model.json'
);
const { parse: parseJSON } = JSON;
const { readFile } = promises;

const CONTENT_MODELS = [
  'autocapitalizeInheriting',
  'embedded',
  'empty',
  'flow',
  'formAssociated',
  'heading',
  'interactive',
  'labelable',
  'listed',
  'metadata',
  'palpable',
  'phrasing',
  'resettable',
  'scriptSupporting',
  'sectioning',
  'sectioningRoot',
  'submittable',
  'transparent',
];

const OTHER_CATEGORIES = ['rawText', 'void'];

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

const toAttribute = ([key, value]) => {
  if (value.cases) {
    value.cases = Sq.entries(value.cases)
      .flatMap(toAttribute)
      .collectEntries();
  } else if (value.tokens) {
    if (hasSameValues(value.tokens, 'true', 'false')) {
      value.effectiveInstance = 'true/false';
    } else if (hasSameValues(value.tokens, 'yes', 'no')) {
      value.effectiveInstance = 'yes/no';
    } else if (hasSameValues(value.tokens, 'on', 'off')) {
      value.effectiveInstance = 'on/off';
    } else if (hasSameValues(value.tokens, 'true', 'false', 'mixed')) {
      value.effectiveInstance = 'true/false/mixed';
    } else if (hasSameValues(value.tokens, 'true', 'false', 'undefined')) {
      value.effectiveInstance = 'true/false/undefined';
    }
  }

  return [[key, value]];
};

export const prepareModelData = (data, path) => {
  const extractEntries = (prop, transform = entry => [entry]) => {
    const value = data[prop];
    if (value == null) {
      throw new Error(
        `Property "${prop}" is missing from model data in "${path}"`
      );
    } else if (typeof value !== 'object') {
      throw new Error(
        `Property "${prop}" is invalid for model data in "${path}"`
      );
    }
    return Sq.entries(value)
      .filter(([k, _]) => k !== '//')
      .flatMap(transform)
      .collectEntries(new Map());
  };

  const categories = extractEntries('categories', ([k, v]) => [
    [k, new Set(v)],
  ]);

  const missing = Sq.concat(CONTENT_MODELS, OTHER_CATEGORIES)
    .filter(name => !categories.has(name) || !categories.get(name).size)
    .collect();

  if (missing.length === 1) {
    throw new Error(
      `Category "${missing[0]}" is missing from model data in "${path}"`
    );
  } else if (missing.length > 0) {
    throw new Error(
      `Categories ${missing
        .map((c, i) => (i === missing.length - 1 ? 'and ' : '') + `"${c}"`)
        .join(', ')} are missing from model data in "${path}"`
    );
  }

  const elements = extractEntries('elements');
  const attributes = extractEntries('attributes', toAttribute);
  const globalAttributes = new Set((elements.get('*') || {}).attributes || []);
  if (globalAttributes.size === 0) {
    throw new Error(
      `Global attributes are missing from model data in "${path}"`
    );
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

class Attribute {
  constructor(name, spec) {
    this.name = name;
    assign(this, spec);
  }

  isMultivalued() {
    return !!this.separator;
  }

  isInstance() {
    return !!this.instance;
  }

  isEnum() {
    return !!this.tokens;
  }

  hasEnum(value) {
    return this.tokens && this.tokens.includes(value);
  }
}

const CustomData = new Attribute('data-*', { instance: '*' });
const EventHandler = new Attribute('on*', { instance: 'eventHandler' });

// =============================================================================

class Element {
  constructor(name, spec, model) {
    this.name = name;
    assign(this, spec);
    this.model = model;
  }

  isVoid() {
    return this.model.hasCategory(this.name, 'void');
  }

  hasRawText() {
    return this.model.hasCategory(this.name, 'rawText');
  }

  child(name, ...ancestors) {
    if (!this.children) {
      throw new Error(`Element <${this.name}> should not have children`);
    }

    const { model, children } = this;
    let { category, elements } = children;

    if (category === 'transparent') {
      for (const ancestor of ancestors) {
        if (!model.hasCategory(ancestor, 'transparent')) {
          const spec = model.elementForName(ancestor);

          if (!spec.children) {
            throw new Error(
              `Closest enclosing non-transparent element <${ancestor}> should not have children`
            );
          }
          ({ category, elements } = spec.children);
        }
      }
    }

    if (
      (!elements || !elements.includes(name)) &&
      (!category || !model.hasCategory(name, category))
    ) {
      throw new Error(
        `Element <${name}> is not a valid child for <${this.name}>`
      );
    }

    return model.elementForName(name);
  }

  attribute(name) {
    const { model } = this;
    const isValidHandler = name => {
      const event = name.slice(2);
      if (this.name === 'body') {
        return model.isWindowEvent(event);
      } else {
        return model.isEvent(event);
      }
    };

    if (model.isCustomData(name)) {
      return CustomData;
    } else if (model.isEventHandler(name)) {
      if (!isValidHandler(name)) {
        throw new Error(
          `Event handler "${name}" is not a valid attribute on <${this.name}>`
        );
      }
      return EventHandler;
    } else if (
      !model.isAriaAttribute(name) &&
      !model.isGlobalAttribute(name) &&
      !(this.attributes && this.attributes.includes(name))
    ) {
      throw new Error(
        `Attribute "${name}" is not a valid attribute on <${this.name}>`
      );
    }

    let spec = model.attributes.get(name);
    if (spec == null) {
      throw new Error(`Attribute "${name}" is undefined`);
    } else if (spec.cases) {
      spec.cases = Sq.entries(spec.cases)
        .map(([k, v]) => {
          if (!(v instanceof Attribute)) v = new Attribute(name, v);
          return [k, v];
        })
        .collectEntries(spec.cases);

      return has(spec.cases, this.name)
        ? spec.cases[this.name]
        : spec.cases['*'];
    } else if (!(spec instanceof Attribute)) {
      spec = new Attribute(name, spec);
      model.attributes.set(name, spec);
    }

    return spec;
  }
}

// =============================================================================

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

  constructor(spec) {
    assign(this, spec);
  }

  // Attributes
  // ----------

  isAriaAttribute(name) {
    return name.startsWith('aria-') || name === 'role';
  }

  isCustomData(name) {
    return name.startsWith('data-');
  }

  isEventHandler(name) {
    return name.startsWith('on');
  }

  isGlobalAttribute(name) {
    return this.globalAttributes.has(name);
  }

  // Events
  // ------

  isEvent(name) {
    return this.events.has(name);
  }

  isWindowEvent(name) {
    return this.windowEvents.has(name);
  }

  // Elements
  // --------

  hasCategory(element, category) {
    if (!this.categories.has(category)) {
      throw new Error(`Invalid category "${category}"`);
    }
    return this.categories.get(category).has(element);
  }

  elementForName(name) {
    let spec = this.elements.get(name);
    if (!spec) {
      throw new Error(`Invalid element name "${name}"`);
    } else if (!(spec instanceof Element)) {
      // Convert to Element as needed.
      spec = new Element(name, spec, this);
      this.elements.set(name, spec);
    }
    return spec;
  }
}
