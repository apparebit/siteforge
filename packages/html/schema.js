import {
  All,
  Any,
  Array,
  Check,
  Enum,
  From,
  IntoMap,
  IntoSet,
  Properties,
  String,
  WithAtLeastOne,
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
  cases: Properties(
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
    Properties(
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
    Properties(
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
  elements: IntoMap(Properties(Element, WithoutCommentAndWildcard)),
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

const Model = Context.ify((value, context) => {
  context.result = {
    ...context.resulting(Attributes),
    globalAttributes: context.resulting(GlobalAttributes),
    ...context.resulting(Categories),
    ...context.resulting(Elements),
    ...context.resulting(Events),
  };
  return context.hasDefects();
});

export default Model;
