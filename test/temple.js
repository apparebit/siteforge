/* © 2020 Robert Grimm */

import templatize from '@grr/temple';
import harness from './harness.js';

harness.test('@grr/temple', t => {
  t.throws(() => templatize({ bindings: 665 }));
  t.throws(() => templatize({ bindings: [665] }));
  t.throws(() => templatize({ bindings: 'escape' }));
  t.throws(() => templatize({ bindings: ['<>'] }));
  t.throws(() => templatize({ escape: 'escape' }));
  t.throws(() => templatize({ name: 665 }));
  t.throws(() => templatize({ source: 665 }));

  let template = templatize({
    bindings: 'code',
    source: '<code>${escape(code)}</code>',
  });

  t.is(template({ code: '<tag>' }), '<code>&lt;tag&gt;</code>');
  t.is(template({ code: '`template`' }), '<code>`template`</code>');

  t.end();
});
