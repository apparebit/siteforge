# @grr/html

This package provides the data necessary for automatically validating HTML
documents according to the relevant standards. It is based on the observation
that much of this information is not only required to implement web browsers but
also other tools and libraries that process HTML markup. For instance,
[React.js](https://reactjs.org) contains a subset of this information but spread
out over several modules and with uncertain provenance. Instead, this package
seeks to create a single, well-organized corpus contained in one JSON file and
drawing on standard or standard-equivalent sources only. To simplify use of that
corpus, this package also includes code for ingesting the data and for
validating the attributes and children of HTML elements.

__@grr/html__ draws on the following sources:

  * [HTML Living Standard](https://html.spec.whatwg.org)
  * [WAI-ARIA](https://w3c.github.io/aria/)
  * [Open Graph Protocol](https://ogp.me)

It already models all HTML elements as well as attributes, including those
specific to ARIA and Open Graph. However, it is not yet complete: First, much of
the element model draws on [the index of the living
standard](https://html.spec.whatwg.org/#index). While nicely organized and
regular, that information also is non-normative, with exceptions indicated by
asterisks. Second, the model for `<meta>` elements incorporates the non-standard
`property` attribute as used by the Open Graph Protocol. It does not yet capture
the literal values enumerated in that specification nor does it capture the
interaction between many values that are part of the same structured property.

## API

This package is ESM only. Its default and only supported export is the `Model`
class. It currently supports six predicates about attributes and events, one
method to check whether an element has a given content category, and one method
to look up the model data for an element.


### Model

#### static async Model.load(path?)

Load and validate the specification data from the given file system path. If
omitted, the method loads `model.json` from the same directory as this module.
When invoked repeatedly on the same path, this method may not reload the data
but return a cached copy.

#### _Attributes_

#### Model.prototype.isAriaAttribute(name)

Determine whether the name identifies an ARIA attribute, i.e., is `role` or
starts with `aria-`.

#### Model.prototype.isCustomData(name)

Determine whether the name identifies a custom data attribute, i.e., starts with
`data-`.

#### Model.prototype.isEventHandler(name)

Determine whether the name identifies an event handler attribute, i.e., starts
with `on`.

#### Model.prototype.isGlobalAttribute(attribute)

Determine whether the attribute is one of the global attributes.

#### _Events_

#### Model.prototype.isEvent(event)

Determine whether the event is a regular one that may be raised by any element.

#### Model.prototype.isWindowEvent(event)

Determine whether the event is a window event that may be raised by the `<body>`
element only.

#### _Elements_

#### Model.prototype.hasCategory(element, category)

Determine whether the element is part of the category. Valid categories are the
content categories `autocapitalizeInheriting`, `embedded`, `empty`, `flow`,
`formAssociated`, `heading`, `interactive`, `labelable`, `listed`, `metadata`,
`palpable`, `phrasing`, `resettable`, `scriptSupporting`, `sectioning`,
`sectioningRoots`, `submittable`, and `transparent`, as well as the syntactic
categories `rawText` and `void`.

#### Model.prototype.elementForName(name)

Look up the model data for the given element. This method throws an error if the
element is invalid.


### Element

The just described `Model.elementForName()` returns instances of `Element`. Each
element has a `name` property identifying the element.

#### Element.prototype.isVoid()

Determine whether the element is void.

#### Element.prototype.hasRawText()

Determine whether the element contains (escapable) raw text.

#### Element.prototype.child(name, ...ancestors)

Look up the model data for the given child element and the given ancestors. The
latter must be the names of the elements containing this element. In particular,
`ancestors[0]` (if defined) is the name of the element containing `this.name`
and `this.name`, in turn, contains the child element `name`. This method throws
an error if the element does not exist or if the element should not appear as a
child of this element.

#### Element.prototype.attribute(name)

Look up the model data for the given attribute. This method throws an error if
the attribute does not exist, if no model data is available, or if the attribute
should not appear on this element.


### Attribute

The just described `Element.attribute()` returns instances of `Attribute`. Each
attribute has a `name` property identifying the attribute.

#### Attribute.prototype.isMultivalued()

Determine whether the attribute may have more than one value forming an ordered
set or list. If this method returns a truthy value, this attribute also has a
`separator` property with a value of `comma` or `space`.

#### Attribute.prototype.isInstance()

Determine whether the attribute is typed as a `boolean`, `codePoint` (for
Unicode), `color` (for CSS), `contentType` (as MIME), `contextName`, `css`,
`date`, `date/time/duration`, `elementName`, `featurePolicy`, `hashname`,
`html`, `id`, `imageCandidate`, (`unsigned` or `positive`) `integer`,
`mediaQueryList`, (`unsigned`) `number`, `regularExpression`, `sourceSizeList`,
`text`, `token`, or `url`. If this method returns a truthy value, this attribute
also has an `instance` property identifying one of the above types.

#### Attribute.prototype.isEnum()

Determine whether the attribute has an enumeration of valid values.

#### Attribute.prototype.hasEnum(constant)

Determine whether the given constant is a valid one for the attribute.

---

__@grr/html__ is © 2019 Robert Grimm and licensed under [MIT](LICENSE) terms.

