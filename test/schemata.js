/* © 2020 Robert Grimm */

import Context from '@grr/schemata/context';
import harness from './harness.js';
import * as Schemata from '@grr/schemata';

harness.test('@grr/schemata', t => {
  t.test('context', t => {
    // Static Assertions
    // -----------------

    t.is(Context.assertString('string'), 'string');
    t.throws(() => Context.assertString(665));

    t.is(Context.assertKey(665), 665);
    t.is(Context.assertKey('key'), 'key');
    t.throws(() => Context.assertKey(665n));
    t.throws(() => Context.assertKey(/boo/u));

    t.same(Context.assertKeyArray([]), []);
    t.same(Context.assertKeyArray(['k1', 'k2', 3]), ['k1', 'k2', 3]);
    t.throws(() => Context.assertKeyArray({}));
    t.throws(() => Context.assertKeyArray());
    t.throws(() => Context.assertKeyArray(null));
    t.throws(() => Context.assertKeyArray({ length: 3 }));

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

    // Context Object
    // --------------

    // Basic Properties

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

      // withCheckpoint()

      context.withCheckpoint((v, c) => {
        t.is(c, context);
        t.is(v, value);
        t.notOk(c.hasDefectsSinceCheckpoint());
        c.defect('is bad');
        t.ok(c.hasDefectsSinceCheckpoint());
        c.clearDefectsSinceCheckpoint();
        t.notOk(c.hasDefectsSinceCheckpoint());
      });

      // withKeyArray() and withProperties()

      return context.withProperties([['quantity', Quantity]]);
    });
    t.same(ObjectWithQuantity({ quantity: 665 }), { quantity: 665n });

    const NonStrict = { requireContainer: false };
    const Nothing = () => false;

    const withFailure = fn =>
      Context.ify((value, context) => {
        t.notOk(context.hasDefects());
        t.notOk(fn(value, context));
        t.ok(context.hasDefects());
        context.clearDefectsSinceCheckpoint();
        return true;
      })(665);

    withFailure((value, context) => context.withProperties([['key', Nothing]]));
    withFailure((value, context) => context.withKeyArray(['key'], Nothing));

    const withSuccess = fn =>
      Context.ify((value, context) => {
        t.notOk(context.hasDefects());
        t.ok(fn(value, context));
        t.notOk(context.hasDefects());
        return true;
      })(665);

    withSuccess((value, context) =>
      context.withProperties([['key', Nothing]], NonStrict)
    );
    withSuccess((value, context) =>
      context.withKeyArray(['key'], Nothing, NonStrict)
    );

    t.is(
      Context.ify((value, context) =>
        context.withKeyArray(['a', 'b'], (value, context) => {
          const ok = value === 42;
          if (ok) context.result = 665;
          return ok;
        })
      )({ a: { b: 42 } }),
      665
    );

    // defect()

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

    // Context.ify()

    t.throws(
      () => Context.ify(Nothing)(665),
      /Validation found one defect:\nValue was rejected by "Nothing"/u
    );

    t.throws(
      () => Context.ify(() => false)(665),
      /Validation found one defect:\nValue was rejected by anonymous schema/u
    );

    t.end();
  });

  t.test('schemata', t => {
    t.ok(Schemata.Nullish());
    t.ok(Schemata.Nullish(null));
    t.notOk(Schemata.Nullish(665));

    t.notOk(Schemata.Enum(1, 2, 3)(0));
    t.ok(Schemata.Enum(1, 2, 3)(1));
    t.ok(Schemata.Enum(1, 2, 3)(2));
    t.ok(Schemata.Enum(1, 2, 3)(3));
    t.notOk(Schemata.Enum(1, 2, 3)(4));

    const allDoubleDigits = new Set([11, 22, 33, 44, 55, 66, 77, 88, 99]);
    const DoubleDigit = Schemata.Enum(allDoubleDigits);
    t.notOk(DoubleDigit(10));
    t.notOk(DoubleDigit(100));
    t.ok(DoubleDigit(11));
    t.ok(DoubleDigit(99));

    const Always = Schemata.Check(Symbol(`tripwire`), () => true);
    const Never = Schemata.Check('is entirely unacceptable', () => false);

    const fails = thunk =>
      t.throws(thunk, /Validation found (one defect|\d+ defects)/u);

    t.is(Always(665), 665);
    fails(() => Never(665));
    t.is(Schemata.Any(Never, Always)(665), 665);
    fails(() => Schemata.Any(Never, Never)(665));
    t.is(Schemata.All(Always, Always)(665), 665);
    fails(() => Schemata.All(Always, Never)(665));
    t.is(Schemata.Option(Never)(), undefined);
    t.is(Schemata.Option(Always)(665), 665);
    fails(() => Schemata.Option(Never)(665));
    t.is(Schemata.From('a', Always)({ a: 665 }), 665);
    t.is(Schemata.From(['a'], Always)({ a: 665 }), 665);
    t.throws(
      () => Schemata.From(['a'], Never)({ a: 665 }),
      /Validation found one defect:\nProperty \$\.a is entirely unacceptable/u
    );

    fails(() => Schemata.Array(Always)(665));
    fails(() => Schemata.Array(Always)([]));
    fails(() => Schemata.Array(Always)([1, 2, 3, 1]));
    t.same(Schemata.Array(Always)([1, 2, 3]), [1, 2, 3]);
    fails(() => Schemata.Array(Never)([1, 2, 3]));

    fails(() => Schemata.Dictionary(Always)(665));
    t.same(Schemata.Dictionary(Always)({ answer: 42 }), { answer: 42 });
    t.same(
      Schemata.Dictionary(Always, { filter: k => k !== 'answer' })({
        answer: 42,
        mark: 665,
      }),
      { mark: 665 }
    );

    const aNo_bYes = { a: Never, b: Always };
    const aNo_bFrom_cYes = { a: Never, b: { from: 'c', schema: Always } };
    const LaxMin1 = Schemata.WithAtLeastOne;

    fails(() => Schemata.Properties(aNo_bYes, LaxMin1)({}));
    t.same(Schemata.Properties(aNo_bYes, LaxMin1)({ b: 13 }), { b: 13 });
    t.same(Schemata.Properties(aNo_bFrom_cYes, LaxMin1)({ c: 13 }), { b: 13 });

    fails(() => Schemata.Properties({ a: Schemata.Number })({ c: 42 }));
    t.same(Schemata.Properties({ a: Always })({ a: 42 }), { a: 42 });

    fails(() => Schemata.IntoSet(Never)());
    t.same(Schemata.IntoSet(Always)([665]), new Set([665]));
    t.same(Schemata.IntoSet(Always)({ answer: 42 }), new Set([42]));

    fails(() => Schemata.IntoMap(Never)());
    t.same(Schemata.IntoMap(Always)([665]), new Map([[0, 665]]));
    t.same(Schemata.IntoMap(Always)({ answer: 42 }), new Map([['answer', 42]]));

    fails(() => Schemata.IntoRecord(Never)());
    fails(() => Schemata.IntoRecord({ key: Never })());
    t.same(
      Schemata.IntoRecord(Schemata.Properties({ a: Always }), {
        b: Schemata.From('c', Always),
      })({ a: 42, c: 665 }),
      { a: 42, b: 665 }
    );

    t.end();
  });

  t.end();
});
