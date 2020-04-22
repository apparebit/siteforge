/* © 2020 Robert Grimm */

import { EOL } from 'os';

const { has } = Reflect;
const { isArray } = Array;
const { keys: keysOf } = Object;
const { stringify } = JSON;

const ATTRIBUTE_TYPE = new Set([
  'Boolean',
  'CodePoint',
  'Color',
  'ContentType',
  'ContextName',
  'CSS',
  'Date',
  'DateTimeDuration',
  'ElementName',
  'FeaturePolicy',
  'HashName',
  'HTML',
  'ID',
  'ImageCandidate',
  'Integer',
  'LanguageTag',
  'MediaQueryList',
  'Number',
  'OnOff',
  'PositiveInteger',
  'RegularExpression',
  'SourceSizeList',
  'Text',
  'Token',
  'TrueFalse',
  'TrueFalseMixed',
  'TrueFalseUndefined',
  'UnsignedInteger',
  'UnsignedNumber',
  'URL',
  'YesNo',
]);

const CONTENT_CATEGORY = new Set([
  '*',
  '>text<',
  'flow',
  'metadata',
  'phrasing',
  'transparent',
]);

const select = (path, key) => {
  const type = typeof key;
  if (type === 'number') {
    return `${path}[${key}]`;
  } else if (type !== 'string') {
    throw new Error(`invalid key "${key}"`);
  } else if (/^[a-z_][a-z0-9_]*$/iu.test(key)) {
    return `${path}.${key}`;
  } else {
    return `${path}[${stringify(key)}]`;
  }
};

export default function validate(model) {
  if (model === null || typeof model !== 'object') {
    throw new Error(`Model data is not an object`);
  }

  // =================================================================== Helpers
  let path = '$';
  let value = model;
  let defects = [];

  const defect = description => {
    defects.push(`Model data property "${path}" ${description}`);
  };

  // ------------------------------------------------------------- checkProperty
  const checkProperty = (key, fn) => {
    const parentPath = path;
    const parent = value;
    path = select(path, key);
    value = value[key];
    try {
      return fn(value);
    } finally {
      path = parentPath;
      value = parent;
    }
  };

  // ------------------------------------------------------- checkPropertyExists
  const checkPropertyExists = (key, fn) => {
    if (!has(value, key)) {
      return defect(`does not have property "${key}"`);
    }
    return checkProperty(key, fn);
  };

  // ------------------------------------------------------- checkStringProperty
  const checkStringProperty = (key, checkValue = () => {}) => {
    return checkPropertyExists(key, value => {
      if (typeof value !== 'string') {
        defect('is not a string');
      } else {
        checkValue(value);
      }
      return value;
    });
  };

  // -------------------------------------------------------- checkArrayProperty
  const checkArrayProperty = (
    key,
    { allowDefault = false, checkEntryText = () => {} } = {}
  ) => {
    return checkPropertyExists(key, value => {
      const elements = new Set();

      if (!isArray(value)) {
        defect('is not an array of strings');
      } else if (value.length === 0) {
        defect(`is an empty array`);
      } else {
        for (let index = 0; index < value.length; index++) {
          checkProperty(index, element => {
            let text;
            if (typeof element === 'string') {
              text = element;
            } else if (
              allowDefault &&
              element &&
              typeof element.default === 'string'
            ) {
              text = element.default;
            } else {
              defect('is not a string');
            }

            if (text !== undefined) {
              if (elements.has(text)) {
                defect('is duplicate');
              } else {
                elements.add(text);
                checkEntryText(text);
              }
            }
          });
        }
      }

      return elements;
    });
  };

  // ------------------------------------------------------- checkObjectProperty
  const checkObjectProperty = (key, fn) => {
    return checkPropertyExists(key, value => {
      if (value === null || typeof value !== 'object') {
        return defect('is not an object');
      }
      return fn(value);
    });
  };

  // ----------------------------------------------------------- forEachProperty
  const forEachProperty = fn => {
    const table = new Map();

    for (const key of keysOf(value)) {
      if (key === '//' || key === '*') continue;
      table.set(key, fn(key));
    }
    if (table.size === 0) {
      defect('has no named property');
    }
    return table;
  };

  // ------------------------------------------------------- isXName, XNameCheck
  const createNameValidator = key => {
    if (model[key] && typeof model[key] === 'object') {
      const names = new Set(
        keysOf(model[key]).filter(k => k !== '//' && k !== '*')
      );
      return name => names.has(name);
    } else {
      return () => true;
    }
  };

  const isAttributeName = createNameValidator('attributes');
  const isElementName = createNameValidator('elements');
  const ElementNameCheck = {
    checkEntryText(name) {
      if (!isElementName(name)) {
        defect('is not an element name');
      }
    },
  };

  // ================================================================ Attributes
  const checkBasicAttribute = value => {
    let hasTypeOrEnum = false;
    if (has(value, 'type')) {
      hasTypeOrEnum = true;
      checkStringProperty('type', value => {
        if (!ATTRIBUTE_TYPE.has(value)) {
          defect('is not a valid attribute type');
        }
      });
    }
    if (has(value, 'enum')) {
      hasTypeOrEnum = true;
      checkArrayProperty('enum', { allowDefault: true });
    }
    if (!hasTypeOrEnum) {
      defect('has neither "type" nor "enum" property');
    }
    return value;
  };

  const checkAttribute = value => {
    if (has(value, 'cases')) {
      checkObjectProperty('cases', () => {
        checkObjectProperty('*', value => {
          if (has(value, 'elements')) {
            checkArrayProperty('elements', ElementNameCheck);
          }
          checkBasicAttribute(value);
        });

        forEachProperty(key => checkObjectProperty(key, checkBasicAttribute));
      });
      return value;
    } else {
      return checkBasicAttribute(value);
    }
  };

  const attributes = checkObjectProperty('attributes', () =>
    forEachProperty(key => checkObjectProperty(key, checkAttribute))
  );

  const globalAttributes = (() => {
    if (model.elements && model.elements['*']) {
      path = `$.elements["*"]`;
      value = model.elements['*'];
      try {
        return checkArrayProperty('attributes', {
          checkEntryText(name) {
            if (!isAttributeName(name)) {
              defect('is not an attribute name');
            }
          },
        });
      } finally {
        path = '$';
        value = model;
      }
    } else {
      return new Set();
    }
  })();

  // ================================================================ Categories
  const categories = checkObjectProperty('categories', () =>
    forEachProperty(key =>
      checkArrayProperty(key, {
        checkEntryText(name) {
          if (
            !isElementName(name) &&
            name !== '<custom-element>' &&
            name !== '>text<'
          ) {
            defect('is not an element name');
          }
        },
      })
    )
  );

  // ================================================================== Elements
  const checkElementSpec = (key, value) => {
    // ----------------------------- element.attributes
    if (has(value, 'attributes')) {
      if (key === '<custom-element>' || key === 'math' || key === 'svg') {
        checkStringProperty('attributes', value => {
          if (value !== '*') {
            defect('is not "*"');
          }
        });
      } else {
        checkArrayProperty('attributes', {
          checkEntryText(name) {
            if (name !== '*' && !isAttributeName(name)) {
              defect('is not an attribute name');
            } else if (globalAttributes.has(name)) {
              defect('is a global attribute name');
            }
          },
        });
      }
    }

    // ----------------------------- element.content
    if (has(value, 'content')) {
      checkObjectProperty('content', value => {
        let hasCategoryOrElements = false;

        // ------------------------- element.content.category
        if (has(value, 'category')) {
          hasCategoryOrElements = true;
          if (key !== 'math' && key !== 'svg') {
            checkStringProperty('category', name => {
              if (!CONTENT_CATEGORY.has(name)) {
                defect('is not a valid content category');
              }
            });
          }
        }

        // ------------------------- element.content.elements
        if (has(value, 'elements')) {
          hasCategoryOrElements = true;
          checkArrayProperty('elements', ElementNameCheck);
        }

        if (!hasCategoryOrElements) {
          defect('has neither "category" nor "elements" property');
        }
      });
    }

    return value;
  };

  const elements = checkObjectProperty('elements', () =>
    forEachProperty(key =>
      checkObjectProperty(key, value => checkElementSpec(key, value))
    )
  );

  // ==================================================================== Events
  const [events, windowEvents] =
    checkObjectProperty('events', () => [
      checkArrayProperty('*'),
      checkArrayProperty('window'),
    ]) || [];

  // =========================================================== Validated Model
  if (defects.length === 0) {
    return {
      attributes,
      globalAttributes,
      categories,
      elements,
      events,
      windowEvents,
    };
  } else if (defects.length === 1) {
    throw new Error(defects[0]);
  } else {
    throw new Error(
      `Model data has ${defects.length} defects:${EOL}${defects.join(EOL)}`
    );
  }
}
