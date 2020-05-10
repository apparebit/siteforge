import {
  Any,
  Array,
  AtLeastOne,
  Check,
  Distinct,
  OneOf,
  Properties,
  String,
} from '@grr/schemata';

import Context from '@grr/schemata/context';

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

const normalizeEnum = (value, state, context) => {
  if (value && typeof value.default === 'string') {
    if (state.defaulted) {
      context.addDefect('is duplicate default');
    } else {
      state.defaulted = true;
    }
    return value.default;
  } else {
    return value;
  }
};

const Attribute = Properties(
  {
    type: OneOf(ATTRIBUTE_TYPE),
    enum: Array(Any(String, Properties({ default: String })), {
      distinct: true,
      normalize: normalizeEnum,
    }),
  },
  AtLeastOne
);

const AttributeCases = Properties({
  cases: Properties(
    Check(
      `should describe HTML attribute via "type" or "enum" properties`,
      Attribute
    )
  ),
});

const Attributes = Properties({
  attributes: Check(
    `should describe HTML attribute via "cases", "type", or "enum" properties`,
    Any(AttributeCases, Attribute)
  ),
});

const Categories = Properties({
  categories: Check(
    'should list HTML element names belonging to category',
    Array(String, Distinct)
  ),
});

const ElementContent = Properties(
  {
    category: OneOf(CONTENT_CATEGORY),
    elements: Check(
      `should list HTML elements valid as content`,
      Array(String)
    ),
  },
  AtLeastOne
);

const Elements = Properties({
  elements: Check(
    `should describe HTML element via "attributes" and "content" properties`,
    Properties(
      {
        attributes: Check(
          `should list HTML element's attribute names`,
          Array(String, Distinct)
        ),
        content: Check(
          `should describe HTML element's content via "category" and "elements"`,
          ElementContent
        ),
      },
      AtLeastOne
    )
  ),
});

const EventNames = Check(
  'should be array listing all event names',
  Array(String, Distinct)
);

const Events = Properties({
  '*': EventNames,
  window: EventNames,
});

const Model = Context.ify(
  Properties({
    attributes: Attributes,
    categories: Categories,
    elements: Elements,
    events: Events,
  })
);

export default function validate(data) {
  return Model(data);
}
