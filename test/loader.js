/* © 2020 Robert Grimm */

import Call from '@grr/loader/call';
import { filePath, fileURL } from '@grr/loader';
import { fileURLToPath } from 'url';
import harness from './harness.js';

const Dummy = new URL('./dummy.js', fileURL).href;
const DummyHash = n => `${Dummy}#${n}`;
const LoaderOn = fileURLToPath(new URL('./loader-on.js', import.meta.url).href);

harness.test('@grr/loader', async t => {
  t.test('call', async t => {
    t.throws(() => new Call());
    t.throws(() => new Call(665));

    const log = [];
    const call = new Call({
      billy: data => {
        log.push({ command: 'billy', data });
        return { data };
      },
      silly: data => {
        throw new Error(`data is ${data}`);
      },
    });

    t.ok(!Call.Request.is('@grr/rollcall'));
    t.ok(Call.Request.is('@grr/loader/invoke/almostTheBeast/665'));

    t.throws(() => Call.Request.to('boo'));
    t.same(Call.Request.to('@grr/loader/invoke/commandissimo'), {});
    t.same(Call.Request.to('@grr/loader/invoke/commando/"conquer"'), {
      command: 'commando',
      data: 'conquer',
    });

    t.ok(!Call.Response.is('https://apparebit.com'));
    t.ok(Call.Response.is(DummyHash(123)));

    t.same(Call.Response.to({ beastly: 665 }), {
      source: `export default {"beastly":665};`,
    });

    const request = async specifier =>
      (await call.handleRequest(specifier)).url;
    const response = num => call.handleResponse(DummyHash(num)).source;

    t.is(await request('@grr/loader/invoke/billy'), DummyHash(1));
    t.is(await request('@grr/loader/invoke/frilly/13'), DummyHash(2));
    t.is(await request('@grr/loader/invoke/billy/665'), DummyHash(3));
    t.is(await request('@grr/loader/invoke/silly/665'), DummyHash(4));

    t.is(
      response(1),
      `export default ` +
        `{"error":"malformed XPC request \\"@grr/loader/invoke/billy\\""};`
    );

    t.is(
      response(2),
      `export default ` +
        `{"error":"XPC command \\"frilly\\" is not implemented"};`
    );

    t.is(response(3), `export default ` + `{"value":{"data":665}};`);
    t.ok(response(4).startsWith(`export default {"error":"data is 665"`));

    t.end();
  });

  let status = await import('@grr/loader/status');
  t.is(status.default, 'no loader');

  const { execPath: node } = process;
  t.spawn(node, [`--experimental-loader=${filePath}`, LoaderOn]);

  t.end();
});
