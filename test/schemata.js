/* © 2020 Robert Grimm */

import Context from '@grr/schemata/context';
import harness from './harness.js';
import * as Schemata from '@grr/schemata';

harness.test('@grr/schemata', t => {
  t.test('context', t => {
    t.is(Context.assertString('string'), 'string');
    t.throws(() => Context.assertString(665));

    t.is(Context.assertKey(665), 665);
    t.is(Context.assertKey('key'), 'key');
    t.throws(() => Context.assertKey(665n));
    t.throws(() => Context.assertKey(/boo/u));

    t.same(Context.assertKeyPath([]), []);
    t.same(Context.assertKeyPath(['k1', 'k2', 3]), ['k1', 'k2', 3]);
    t.throws(() => Context.assertKeyPath({}));
    t.throws(() => Context.assertKeyPath());
    t.throws(() => Context.assertKeyPath(null));
    t.throws(() => Context.assertKeyPath({ length: 3 }));

    t.is(Context.assertEnumConstant(true), true);
    t.is(Context.assertEnumConstant(665), 665);
    t.is(Context.assertEnumConstant(665n), 665n);
    t.is(Context.assertEnumConstant('text'), 'text');
    t.throws(() => Context.assertEnumConstant());
    t.throws(() => Context.assertEnumConstant(null));
    t.throws(() => Context.assertEnumConstant({}));
    t.throws(() => Context.assertEnumConstant(() => {}));

    t.is(Context.assertFunction(Context), Context);
    t.throws(() => Context.assertFunction(665));

    const a1 = [];
    const a2 = [Context];
    t.is(Context.assertFunctionArray(a1), a1);
    t.is(Context.assertFunctionArray(a2), a2);
    t.throws(() => Context.assertFunctionArray(665));
    t.throws(() => Context.assertFunctionArray([665]));

    const o1 = {};
    const o2 = () => {};
    t.is(Context.assertObjectLike(o1), o1);
    t.is(Context.assertObjectLike(o2), o2);
    t.throws(() => Context.assertObjectLike());
    t.throws(() => Context.assertObjectLike(null));
    t.throws(() => Context.assertObjectLike(665));

    t.same(Context.assertIterable([665]), [665]);
    t.throws(() => Context.assertIterable(665));

    // -------------------------------------------------------------------------

    const Quantity = Context.ify((value, context) => {
      t.is(value, context.value);
      t.is(value, context.result);
      t.is(value, 665);
      t.ok(context);
      t.is(context.path, '$.quantity');
      t.is(context.key, 'quantity');
      context.result = 665n;
      return true;
    });
    const ObjectWithQuantity = Context.ify((value, context) => {
      t.is(value, context.value);
      t.is(value, context.result);
      t.same(value, { quantity: 665 });
      t.ok(context);
      t.is(context.path, '$');
      t.is(context.key, undefined);
      t.is(context.toError(), undefined);
      t.notOk(context.hasDefects());

      context.withCheckpoint((v, c) => {
        t.is(c, context);
        t.is(v, value);
        t.notOk(c.hasDefectsSinceCheckpoint());
        c.defect('is bad');
        t.ok(c.hasDefectsSinceCheckpoint());
        c.clearDefectsSinceCheckpoint();
        t.notOk(c.hasDefectsSinceCheckpoint());
      });

      return context.withProperties([['quantity', Quantity]]);
    });
    t.same(ObjectWithQuantity({ quantity: 665 }), { quantity: 665n });

    const b2 = Context.ify((_, context) => {
      context.defect(`isn't to my liking`);
      return false;
    });
    const t2 = Context.ify((_, context) => {
      t.notOk(Schemata.Properties({ b2 })(_, context));
      context.defect(`is a bit screwy`);
      return false;
    });
    t.throws(
      () => t2({ b2: 665 }),
      /Validation found 2 defects:\nProperty \$\.b2 isn't to my liking\nValue is a bit screwy/u
    );

    const falsify = () => false;
    t.throws(
      () => Context.ify(falsify)(665),
      /Validation found one defect:\nValue was rejected by "falsify"/u
    );

    t.end();
  });

  t.ok(Schemata.Nullish());
  t.ok(Schemata.Nullish(null));
  t.notOk(Schemata.Nullish(665));

  t.notOk(Schemata.Enum(1, 2, 3)(0));
  t.ok(Schemata.Enum(1, 2, 3)(1));
  t.ok(Schemata.Enum(1, 2, 3)(2));
  t.ok(Schemata.Enum(1, 2, 3)(3));
  t.notOk(Schemata.Enum(1, 2, 3)(4));

  const Zahlen = new Set([11, 22, 33, 44, 55, 66, 77, 88, 99]);
  const Schnapszahl = Schemata.Enum(Zahlen);
  t.notOk(Schnapszahl(10));
  t.notOk(Schnapszahl(100));
  t.ok(Schnapszahl(11));
  t.ok(Schnapszahl(99));

  t.end();
});
