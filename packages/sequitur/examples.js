/* © 2019 Robert Grimm */

import { strict } from 'assert';
import Sq from '@grr/sequitur';

// Sq.from()

strict.deepEqual([...Sq.from()], []);
strict.deepEqual([...Sq.from([1, 2, 3])], [1, 2, 3]);

strict.deepEqual(
  [
    ...Sq.from(function*() {
      yield 42;
      yield 665;
    }),
  ],
  [42, 665]
);

(async function() {
  strict.deepEqual(
    // eslint-disable-next-line require-await
    await Sq.from(async function*() {
      yield 'async';
      yield '/';
      yield 'await';
    }).join(),
    'async/await'
  );
})();

// Context is automatically propagated:

const s1 = Sq.of(1, 2, 3).with('context');
const s2 = s1.map(n => n * n);
const s3 = s2.tap(function() {
  strict.equal(this, 'context');
});

strict.deepEqual([...s1], [1, 2, 3]);
strict.deepEqual([...s2], [1, 4, 9]);
strict.deepEqual([...s3], [1, 4, 9]);

strict.equal(s1.context, 'context');
strict.equal(s2.context, 'context');
strict.equal(s3.context, 'context');

// reduce() works similar to Array.prototype.reduce:

strict.deepEqual(
  Sq.of(1, 2, 3).reduce((accumulator, element) => {
    accumulator.push(element);
    return accumulator;
  }, []),
  [1, 2, 3]
);

// Or, more concisely:

strict.deepEqual(
  Sq.of(1, 2, 3).reduce((acc, el) => (acc.push(el), acc), []),
  [1, 2, 3]
);

// join() defaults to empty string:

strict.equal([1, 2, 3].join(), '1,2,3');
strict.equal(Sq.of(1, 2, 3).join(), '123');
