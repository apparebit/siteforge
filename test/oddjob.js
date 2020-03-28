/* © 2020 Robert Grimm */

import { isError, TracelessError } from '@grr/oddjob/error';
import { asciify, slugify } from '@grr/oddjob/string';
import harness from './harness.js';
import { types } from 'util';

const { isNativeError } = types;

harness.test('@grr/oddjob', t => {
  t.test('error', t => {
    function X() {}
    X.prototype = new Error();

    let x = new X();
    t.ok(x instanceof Error);
    t.notOk(isNativeError(x));
    t.ok(isError(x));

    x = new Error();
    t.ok(x instanceof Error);
    t.ok(isNativeError(x));
    t.ok(isError(x));

    x = TracelessError();
    t.ok(x instanceof Error);
    t.ok(isNativeError(x));
    t.ok(isError(x));

    x = new TypeError('boo');
    t.ok(x instanceof Error);
    t.ok(isNativeError(x));
    t.ok(isError(x));

    x = TracelessError('boo', TypeError);
    t.ok(x instanceof Error);
    t.ok(isNativeError(x));
    t.ok(isError(x));

    t.end();
  });

  t.test('string', t => {
    // ------------------------------------------------------- asciify()
    t.is(
      asciify('àáâ ãäå æçè éêë ìíî ïñò óôõ öœø ùúû üýÿ ðłß Ǆǅǆ'),
      'aaa aaeaa aece eee iii ino ooo oeoeoe uuu ueyy dlss DZDzdz'
    );
    t.is(
      asciify('ÀÁÂ ÃÄÅ ÆÇÈ ÉÊË ÌÍÎ ÏÑÒ ÓÔÕ ÖŒØ ÙÚÛ ÜÝŸ ÐŁẞ'),
      'AAA AAeAa AeCE EEE III INO OOO OeOeOe UUU UeYY DLSS'
    );
    t.is(asciify('㎧ ㏗ ⓠ ſ Ⅷ 🅏 ẚ ŉ'), `m/s pH q s VIII WC a' 'n`);
    t.is(asciify('-﹣－‐‑﹘–—'), '--------');

    // ------------------------------------------------------- slugify()
    t.is(slugify('Çäłÿ at - 7 ㎯?'), 'caely-at-7-rads2');

    t.end();
  });

  t.end();
});
