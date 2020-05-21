import {
  All,
  Any,
  Array,
  Check,
  Dictionary,
  Enum,
  From,
  IntoMap,
  IntoRecord,
  IntoSet,
  Properties,
  String,
  WithAtLeastOne,
} from '@grr/schemata';

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

const Attribute = All(
  Properties(
    {
      type: Enum(ATTRIBUTE_TYPE),
      enum: Array(Any(String, Properties({ default: String })), {
        distinct: true,
        normalize: normalizeEnum,
      }),
    },
    WithAtLeastOne
  ),
  Properties({ separator: Enum('comma', 'space') })
);

const AttributeCases = Properties({
  cases: Dictionary(
    Check(
      `should describe HTML attribute via "type" or "enum" properties`,
      Attribute
    )
  ),
});

const WithoutCommentAndWildcard = {
  filter: ([key]) => key !== '//' && key !== '*',
};

const Attributes = Properties({
  attributes: IntoMap(
    Dictionary(
      Check(
        `should describe HTML attribute via "cases", "type", or "enum" properties`,
        Any(AttributeCases, Attribute)
      ),
      WithoutCommentAndWildcard
    )
  ),
});

const GlobalAttributes = From(
  ['elements', '*'],
  IntoSet(
    Check('should be an array listing the global attributes', Array(String))
  )
);

const Categories = Properties({
  categories: IntoMap(
    Dictionary(
      IntoSet(
        Check(
          'should list HTML element names belonging to category',
          Array(String)
        )
      ),
      WithoutCommentAndWildcard
    )
  ),
});

const ElementContent = Properties(
  {
    category: Enum(CONTENT_CATEGORY),
    elements: Check(
      `should list HTML elements valid as content`,
      Array(String)
    ),
  },
  WithAtLeastOne
);

const Element = Check(
  `should describe HTML element via "attributes" and "content" properties`,
  Properties(
    {
      attributes: Check(
        `should list HTML element's attribute names`,
        Array(String)
      ),
      content: Check(
        `should describe HTML element's content via "category" and "elements"`,
        ElementContent
      ),
    },
    WithAtLeastOne
  )
);

const Elements = Properties({
  elements: IntoMap(Dictionary(Element, WithoutCommentAndWildcard)),
});

const EventNames = IntoSet(
  Check('should be array listing all event names', Array(String))
);

const Events = From(
  'events',
  Properties({
    events: { from: '*', schema: EventNames },
    windowEvents: { from: 'window', schema: EventNames },
  })
);

const Model = IntoRecord(
  Attributes,
  { globalAttributes: GlobalAttributes },
  Categories,
  Elements,
  Events
);

export default Model;
