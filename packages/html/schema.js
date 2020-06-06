import {
  All,
  Any,
  Array,
  Dictionary,
  Enum,
  From,
  IfNonNull,
  IntoMap,
  IntoRecord,
  IntoSet,
  Properties,
  Report,
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
  Properties({ separator: Enum('comma', 'space') }, IfNonNull)
);

const AttributeCases = Properties({
  cases: Dictionary(
    Report(
      `should describe HTML attribute via "type" or "enum" properties`,
      Attribute
    )
  ),
});

const WithoutCommentAndWildcard = {
  filter: key => key !== '//' && key !== '*',
};

const Attributes = Properties({
  attributes: IntoMap(
    Dictionary(
      Report(
        `should describe HTML attribute via "cases", "type", or "enum" properties`,
        Any(AttributeCases, Attribute)
      ),
      WithoutCommentAndWildcard
    )
  ),
});

const GlobalAttributes = From(
  ['elements', '*', 'attributes'],
  IntoSet(
    Report('should be an array listing the global attributes', Array(String))
  )
);

const Categories = Properties({
  categories: IntoMap(
    Dictionary(
      IntoSet(
        Report(
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
    category: Report(
      `should be a valid content category`,
      Enum(CONTENT_CATEGORY)
    ),
    elements: Report(
      `should list HTML elements valid as content`,
      Array(String)
    ),
  },
  WithAtLeastOne
);

const Element = Report(
  `should describe HTML element via "attributes" and "content" properties`,
  Properties(
    {
      attributes: Report(
        `should be wildcard or list HTML element's attribute names`,
        Any(Enum('*'), Array(String))
      ),
      content: Report(
        `should describe HTML element's content via "category" and "elements"`,
        ElementContent
      ),
    },
    IfNonNull
  )
);

const Elements = Properties({
  elements: IntoMap(Dictionary(Element, WithoutCommentAndWildcard)),
});

const EventNames = IntoSet(
  Report('should be array listing all event names', Array(String))
);

const Events = From(
  'events',
  Properties({
    events: { from: '*', schema: EventNames },
    windowEvents: { from: 'window', schema: EventNames },
  })
);

const Schema = IntoRecord(
  Attributes,
  { globalAttributes: GlobalAttributes },
  Categories,
  Elements,
  Events
);

export default Schema;
