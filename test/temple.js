/* © 2020 Robert Grimm */

import templatize from '@grr/temple';
import harness from './harness.js';

harness.test('@grr/temple', t => {
  const name = 'greet';
  const tag = (strings, ...values) =>
    values.reduce(
      (acc, item, index) => acc + `<<${item}>>` + strings[index + 1],
      strings[0]
    );
  const library = {
    transform1(value) {
      return `[[${value}]]`;
    },
    transform2(value) {
      return `{{${value}}}`;
    },
  };
  const data = ['one', 'two'];
  const source = '(1): ${transform1(one)}   (2): ${transform2(two)}';

  t.throws(() => templatize({ name: 665 }));
  t.throws(() => templatize({ name, tag: 665 }));
  t.throws(() => templatize({ name, tag: function greet() {} }));
  t.throws(() => templatize({ name, tag, library: 665 }));
  t.throws(() => templatize({ name, tag, library }));
  t.throws(() => templatize({ name, tag, library, data: 665 }));
  t.throws(() => templatize({ name, tag, library, data: [] }));
  t.throws(() => templatize({ name, tag, library, data, source: 665 }));

  let template = templatize({ name, tag, library, data, source });

  t.is(
    template({ one: '---', two: '•••' }),
    '(1): <<[[---]]>>   (2): <<{{•••}}>>'
  );

  template = templatize({ name, data: 'one', source: '<<[[${one}]]>>' });
  t.is(template({ one: '•••' }), '<<[[•••]]>>');

  t.end();
});
