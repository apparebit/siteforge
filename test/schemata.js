/* © 2020 Robert Grimm */

import Context from '@grr/schemata/context';
import harness from './harness.js';
import * as Schemata from '@grr/schemata';

harness.test('@grr/schemata', t => {
  t.test('context', t => {
    t.is(Context.assertString('string'), 'string');
    t.throws(() => Context.assertString(665));
    t.is(Context.assertFunction(Context), Context);
    t.throws(() => Context.assertFunction(665));
    t.same(Context.assertFunctionArray([Context]), [Context]);
    t.throws(() => Context.assertFunctionArray(665));
    t.throws(() => Context.assertFunctionArray([665]));
    t.same(Context.assertFunctionObject({ value: Context }), {
      value: Context,
    });
    t.throws(() => Context.assertFunctionObject(665));
    t.throws(() => Context.assertFunctionObject({ value: 665 }));
    t.same(Context.assertIterable([665]), [665]);
    t.throws(() => Context.assertIterable(665));

    const bottom = Context.ify((value, context) => {
      t.is(value, 665n);
      t.ok(context);
      t.is(context.path, '$.value');
      t.is(context.key, 'value');
      t.is(context.value, 665n);
      return true;
    });
    const top = Context.ify((value, context) => {
      t.is(value, 665);
      t.ok(context);
      t.is(context.path, '$');
      t.is(context.key, undefined);
      t.is(context.value, 665);
      context.map(v => ({ value: BigInt(v) }));
      return context.withProperties([['value', bottom]]);
    });
    t.same(top(665), { value: 665n });

    const falsify = () => false;
    t.throws(
      () => Context.ify(falsify)(665),
      /Value being validated "665" has been rejected by checker "falsify"/u
    );
    t.end();
  });

  t.ok(Schemata.Nullish());
  t.ok(Schemata.Nullish(null));
  t.ok(!Schemata.Nullish(665));

  t.ok(!Schemata.OneOf(1, 2, 3)(0));
  t.ok(Schemata.OneOf(1, 2, 3)(1));
  t.ok(Schemata.OneOf(1, 2, 3)(2));
  t.ok(Schemata.OneOf(1, 2, 3)(3));
  t.ok(!Schemata.OneOf(1, 2, 3)(4));

  t.end();
});
