/* © 2019 Robert Grimm */

import { fileURLToPath } from 'url';
import { promises } from 'fs';
import Schema from './schema.js';

const { assign } = Object;
const { has } = Reflect;
const ModelDotJSON = fileURLToPath(new URL('model.json', import.meta.url));
const { parse: parseJSON } = JSON;
const { readFile } = promises;

// =============================================================================

class Attribute {
  constructor(name, spec) {
    this.name = name;
    assign(this, spec);
  }

  isMultivalued() {
    return !!this.separator;
  }

  hasType() {
    return !!this.type;
  }

  hasEnum(value) {
    return this.enum && this.enum.includes(value);
  }
}

const CustomData = new Attribute('data-*', { type: '*' });
const EventHandler = new Attribute('on*', { type: 'EventHandler' });

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

  element(name, ...ancestors) {
    if (!this.content) {
      throw new Error(`Element <${this.name}> has no content`);
    }

    const { model, content } = this;
    let { category, elements } = content;

    if (category === 'transparent') {
      for (const ancestor of ancestors) {
        if (!model.hasCategory(ancestor, 'transparent')) {
          const spec = model.elementForName(ancestor);

          if (!spec.content) {
            throw new Error(
              `Closest non-transparent enclosing element <${ancestor}> has no content`
            );
          }
          ({ category, elements } = spec.content);
        }
      }
    }

    if (
      (!elements || !elements.includes(name)) &&
      (!category || !model.hasCategory(name, category))
    ) {
      throw new Error(
        `Element <${name}> is not valid content for <${this.name}>`
      );
    }

    return model.elementForName(name);
  }

  attribute(name) {
    const { model } = this;

    if (model.isCustomData(name)) {
      return CustomData;
    } else if (model.isEventHandler(name)) {
      const event = name.slice(2);
      if (
        (this.name === 'body' && !model.isWindowEvent(event)) ||
        (this.name !== 'body' && !model.isEvent(event))
      ) {
        throw new Error(
          `Event handler "${name}" is not valid on <${this.name}>`
        );
      }
      return EventHandler;
    } else if (
      !model.isAriaAttribute(name) &&
      !model.isGlobalAttribute(name) &&
      !(this.attributes && this.attributes.includes(name))
    ) {
      throw new Error(`Attribute "${name}" is not valid on <${this.name}>`);
    }

    let spec = model.attributes.get(name);
    if (spec == null) {
      throw new Error(`Attribute "${name}" is undefined`);
    } else if (spec.cases) {
      // NB: name is attribute name, this.name is element name.
      let att = has(spec.cases, this.name)
        ? spec.cases[this.name]
        : spec.cases['*'];
      if (!(att instanceof Attribute)) {
        att = new Attribute(name, att);
        if (has(spec.cases, this.name)) {
          spec.cases[this.name] = att;
        } else {
          spec.cases['*'] = att;
        }
      }
      return att;
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
  static async load(path) {
    return new Model(parseJSON(await readFile(path, 'utf8')));
  }

  static default() {
    if (!defaultModel) defaultModel = Model.load(ModelDotJSON);
    return defaultModel;
  }

  constructor(spec) {
    assign(this, Schema(spec));
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
