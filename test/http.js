/* © 2020 Robert Grimm */

import { EOL } from 'os';
import { fileURLToPath } from 'url';
import harness from './harness.js';
import { join } from 'path';
import { promises } from 'fs';

import {
  Client,
  Context,
  //createServerEventHandler,
  //events,
  Header,
  identifyEndpoint,
  MediaType,
  MethodName,
  parseDateHTTP,
  parseDateOpenSSL,
  readySelfSigned,
  Server,
  StatusCode,
  validateRequestPath,
} from '@grr/http';

const {
  ContentLength,
  ContentType,
  ContentTypeOptions,
  FrameOptions,
  Location,
  Method,
  Path,
  PermittedCrossDomainPolicies,
  PoweredBy,
  ReferrerPolicy,
  Status,
  StrictTransportSecurity,
  XssProtection,
} = Header;

const { MovedPermanently, NotFound, Ok, Teapot } = StatusCode;
const { GET, HEAD } = MethodName;

const { byteLength } = Buffer;
const { keys: keysOf } = Object;
const logger = harness.rollcall;
const port = 6651;
const { readFile } = promises;

const BareType = {
  HTML: MediaType.HTML.unparameterized(),
  PlainText: MediaType.PlainText.unparameterized(),
};

const prepareSecrets = async () => {
  const path = fileURLToPath(new URL('../tls/localhost', import.meta.url));
  const secrets = await readySelfSigned({ path });
  secrets.authority = 'https://localhost:6651';
  return secrets;
};

const cleanupEndpoints = async (client, server) => {
  if (client) {
    try {
      await client.disconnect();
    } catch (x) {
      harness.rollcall.error('Error disconnecting client', x);
    }
  }

  if (server) {
    try {
      await server.shutDown();
    } catch (x) {
      harness.rollcall.error('Error shutting down server', x);
    }
  }
};

harness.test('@grr/http', t => {
  t.test('@grr/http/MediaType', t => {
    // ----------------------------------------------------- MediaType.unquote()
    t.throws(() => MediaType.unquote('#boo#'));
    t.is(MediaType.unquote(`""`).value, ``);
    t.is(MediaType.unquote(`"boo"`).value, `boo`);
    t.is(MediaType.unquote(`"\\"\\\\\\""`).value, `"\\"`);
    t.is(
      MediaType.unquote(`"text\\"text\\\\text\\"text"`).value,
      `text"text\\text"text`
    );
    t.is(MediaType.unquote(`"text`).value, `text`);
    t.is(MediaType.unquote(`"text\\`).value, `text\\`);

    // -------------------------------------------------------- MediaType.from()
    t.throws(() => MediaType.from(``));
    t.throws(() => MediaType.from(`boo`));
    t.throws(() => MediaType.from(`boo/`));
    t.throws(() => MediaType.from(`/boo`));
    t.throws(() => MediaType.from(`boo/`));
    t.throws(() => MediaType.from(`b(o)o/boo`));
    t.throws(() => MediaType.from(`boo/b(o)o`));
    t.same(MediaType.from('audio/mp4'), MediaType.AudioMP4);
    t.same(MediaType.from('audio/mp4   '), MediaType.AudioMP4);
    t.same(MediaType.from('text/plain ; charset'), BareType.PlainText);

    t.same(
      MediaType.from('text/plain; charset; charset=utf-8'),
      MediaType.PlainText
    );
    t.same(
      MediaType.from('text/plain; charset=; charset=uTF-8'),
      MediaType.PlainText
    );
    t.same(MediaType.from('text/plain; CHARset="UTF-8"'), MediaType.PlainText);

    t.same(
      MediaType.from('text/PLAIN; charset="utf-8"; format=fixed'),
      MediaType.PlainText.with({ format: 'fixed' })
    );
    t.same(
      MediaType.from('TEXT/plain; CHARSET="utf-8"; FORMAT=FIXED'),
      MediaType.PlainText.with({ format: 'FIXED' })
    );

    const css = MediaType.from('text/css');
    t.is(css, MediaType.CSS);
    t.is(css.parameters.charset, 'UTF-8');
    t.is(MediaType.from('text/css'), MediaType.CSS);

    // ------------------------------------------- MediaType.prototype.compare()

    t.is(
      MediaType.VideoMP4.compareTo(MediaType.AudioMP4.with({ q: 0.5 })),
      -0.5
    );
    t.is(
      MediaType.Any.with({ q: 0.2 }).compareTo(
        MediaType.Audio.with({ q: 0.4 })
      ),
      1
    );
    t.is(
      MediaType.Audio.with({ q: 0.4 }).compareTo(
        MediaType.Any.with({ q: 0.2 })
      ),
      -1
    );
    t.is(
      MediaType.Any.with({ q: 0.2 }).compareTo(
        MediaType.AudioMP4.with({ q: 0.4 })
      ),
      2
    );
    t.is(
      MediaType.AudioMP4.with({ q: 0.4 }).compareTo(
        MediaType.Any.with({ q: 0.2 })
      ),
      -2
    );
    t.is(
      MediaType.Any.with({ q: 0.2 }).compareTo(
        MediaType.PlainText.with({ q: 0.4 })
      ),
      3
    );
    t.is(
      MediaType.PlainText.with({ q: 0.4 }).compareTo(
        MediaType.Any.with({ q: 0.2 })
      ),
      -3
    );
    t.is(
      MediaType.PlainText.with({ q: 0.2 }).compareTo(
        MediaType.HTML.with({ q: 0.4 })
      ),
      0.2
    );
    t.is(
      MediaType.HTML.with({ q: 0.4 }).compareTo(
        MediaType.PlainText.with({ q: 0.2 })
      ),
      -0.2
    );
    t.is(MediaType.AudioMP4.compareTo(MediaType.VideoMP4), 0);
    t.is(MediaType.VideoMP4.compareTo(MediaType.AudioMP4), 0);
    t.is(MediaType.Any.compareTo(MediaType.Any), 0);
    t.is(MediaType.Any.compareTo(MediaType.Video), 1);
    t.is(MediaType.Video.compareTo(MediaType.Any), -1);
    t.is(MediaType.Video.compareTo(MediaType.VideoMP4), 1);
    t.is(MediaType.VideoMP4.compareTo(MediaType.Video), -1);
    t.is(MediaType.VideoMP4.compareTo(MediaType.H264), 0);
    t.is(MediaType.H264.compareTo(MediaType.VideoMP4), 0);
    t.is(MediaType.PNG.compareTo(MediaType.SVG), 0);
    t.is(MediaType.SVG.compareTo(MediaType.PNG), 0);
    t.is(MediaType.Image.compareTo(MediaType.Image), 0);
    t.is(MediaType.PlainText.compareTo(MediaType.PlainText), 0);
    t.is(
      MediaType.PlainText.with({ formed: 'fixed' }).compareTo(
        MediaType.PlainText
      ),
      -1
    );
    t.is(
      MediaType.PlainText.with({ formed: 'fixed' }).compareTo(
        BareType.PlainText
      ),
      -2
    );
    t.is(BareType.PlainText.compareTo(MediaType.PlainText), 1);
    t.is(MediaType.PlainText.compareTo(BareType.PlainText), -1);

    // ---------------------------------------------------- MediaType.parseAll()
    let lotsOfParsedTypes = [
      MediaType.parseAll('text/html, text/plain; q=0.7, text/*, */*;q=0.1').map(
        MediaType.create
      ),
      MediaType.parseAll(
        'text/*, text/plain; q=0.7,/plain, */*;   q=0.1, text/html'
      ).map(MediaType.create),
      MediaType.parseAll(
        `*/*, ` +
          `text/plain, ` +
          `text/plain; charset=UTF-8; format=fixed, ` +
          `text/plain; charset=utf8, ` +
          `text/*`
      ).map(MediaType.create),
      MediaType.parseAll(
        `*/*; q=0.1, ` +
          `text/plain; q=0.5, ` +
          `text/plain; charset=UTF-8; format=fixed; q=0.8, ` +
          `text/plain; charset=utf8, ` +
          `text/*; q=0.2`
      ).map(MediaType.create),
    ];

    const lotsOfConstructedTypes = [
      [
        BareType.HTML,
        BareType.PlainText.with({ q: 0.7 }),
        MediaType.Text,
        MediaType.Any.with({ q: 0.1 }),
      ],
      [
        MediaType.Text,
        BareType.PlainText.with({ q: 0.7 }),
        MediaType.Any.with({ q: 0.1 }),
        BareType.HTML,
      ],
      [
        MediaType.Any,
        BareType.PlainText,
        MediaType.PlainText.with({ format: 'fixed' }),
        MediaType.PlainText,
        MediaType.Text,
      ],
      [
        MediaType.Any.with({ q: 0.1 }),
        BareType.PlainText.with({ q: 0.5 }),
        MediaType.PlainText.with({ format: 'fixed', q: 0.8 }),
        MediaType.PlainText,
        MediaType.Text.with({ q: 0.2 }),
      ],
    ];

    t.same(lotsOfParsedTypes, lotsOfConstructedTypes);

    lotsOfParsedTypes.forEach(list => list.sort(MediaType.compare));
    t.same(lotsOfParsedTypes, [
      [
        BareType.HTML,
        BareType.PlainText.with({ q: 0.7 }),
        MediaType.Text,
        MediaType.Any.with({ q: 0.1 }),
      ],
      [
        BareType.HTML,
        BareType.PlainText.with({ q: 0.7 }),
        MediaType.Text,
        MediaType.Any.with({ q: 0.1 }),
      ],
      [
        MediaType.PlainText.with({ format: 'fixed' }),
        MediaType.PlainText,
        BareType.PlainText,
        MediaType.Text,
        MediaType.Any,
      ],
      [
        MediaType.PlainText.with({ format: 'fixed', q: 0.8 }),
        MediaType.PlainText,
        BareType.PlainText.with({ q: 0.5 }),
        MediaType.Text.with({ q: 0.2 }),
        MediaType.Any.with({ q: 0.1 }),
      ],
    ]);

    // ----------------------------------------- MediaType.prototype.isTextual()

    t.ok(MediaType.PlainText.isTextual());
    t.ok(MediaType.HTML.isTextual());
    t.ok(MediaType.Jason.isTextual());
    t.ok(MediaType.SVG.isTextual());
    t.ok(MediaType.from('application/ld+json').isTextual());
    t.notOk(MediaType.Binary.isTextual());
    t.notOk(MediaType.H265.isTextual());
    t.notOk(MediaType.PNG.isTextual());

    // ------------------------------------------- MediaType.prototype.matchTo()
    t.ok(MediaType.PlainText.matchTo(MediaType.Any));
    t.notOk(MediaType.PlainText.matchTo(MediaType.Video));
    t.ok(MediaType.VideoMP4.matchTo(MediaType.Video));
    t.notOk(MediaType.PlainText.matchTo(MediaType.VideoMP4));
    t.ok(MediaType.VideoMP4.matchTo(MediaType.VideoMP4));
    t.ok(
      MediaType.from({ type: 'video', subtype: 'mp4' }).matchTo(
        MediaType.VideoMP4
      )
    );
    t.ok(MediaType.VideoMP4.matchTo({ type: 'video', subtype: 'mp4' }));
    t.ok(MediaType.PlainText.matchTo(MediaType.PlainText));
    t.ok(BareType.PlainText.matchTo(MediaType.PlainText));
    t.ok(MediaType.PlainText.matchTo(BareType.PlainText));
    t.ok(
      MediaType.from('text/plain;CHARSET=utf8').matchTo(MediaType.PlainText)
    );
    t.ok(
      MediaType.from('text/plain;CHARSET="utf8"').matchTo(MediaType.PlainText)
    );
    t.ok(
      MediaType.PlainText.with({ charset: 'UTF-8' }).matchTo(
        MediaType.PlainText
      )
    );
    t.ok(
      BareType.PlainText.with({ charset: 'UTF-8' }).matchTo(MediaType.PlainText)
    );
    t.notOk(
      BareType.PlainText.with({ charset: 'US-ASCII' }).matchTo(
        MediaType.PlainText
      )
    );
    t.ok(MediaType.PlainText.matchTo(BareType.PlainText));
    t.ok(MediaType.PlainText.matchTo(MediaType.Text));
    t.notOk(MediaType.VideoMP4.matchTo(BareType.PlainText));
    t.notOk(MediaType.VideoMP4.matchTo(MediaType.PlainText));
    t.notOk(MediaType.VideoMP4.matchTo(MediaType.Text));
    t.ok(MediaType.VideoMP4.matchTo(MediaType.Any));

    // ------------------------------------------ MediaType.prototype.toString()
    t.is(MediaType.Any.toString(), '*/*');
    t.is(MediaType.Text.toString(), 'text/*');
    t.is(BareType.PlainText.toString(), 'text/plain');
    t.is(MediaType.PlainText.toString(), 'text/plain; charset=UTF-8');

    t.end();
  });

  // ===========================================================================

  t.test('@grr/http/util', t => {
    t.throws(() => validateRequestPath('?query'));
    t.throws(() => validateRequestPath('/*'));
    t.throws(() => validateRequestPath('a/b.html'));

    t.same(validateRequestPath('/a%2Fb'), {
      path: '/a/b',
      query: '',
    });

    t.same(validateRequestPath('/'), {
      path: '/',
      query: '',
    });

    t.same(
      validateRequestPath('/a////b/./../../././../a/b/c.html?some-query'),
      {
        path: '/a/b/c.html',
        query: '?some-query',
      }
    );

    t.same(
      validateRequestPath('/a////b/./../../././../a/b/c.html/?some-query'),
      {
        path: '/a/b/c.html/',
        query: '?some-query',
      }
    );

    t.same(validateRequestPath('/a/%2e/b/%2e%2e/file.json/#anchor'), {
      path: '/a/file.json/',
      query: '',
    });

    // -------------------------------------------------------------------------

    t.is(
      identifyEndpoint({
        address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        family: 'IPv6',
        port: 42,
      }),
      '[2001:0db8:85a3:0000:0000:8a2e:0370:7334]:42'
    );

    t.is(
      identifyEndpoint({
        address: '127.0.0.1',
        family: 'IPv4',
        port: 13,
      }),
      '127.0.0.1:13'
    );

    // -------------------------------------------------------------------------
    // Nothing to parse.
    t.is(parseDateHTTP(), undefined);
    t.is(parseDateOpenSSL(), undefined);

    // Timezone other than GMT.
    t.is(parseDateHTTP('Sat, 08 Aug 2020 16:08:24 EST'), undefined);
    t.is(parseDateOpenSSL('Aug 14 17:13:12 2020 EST'), undefined);

    // Perfectly valid time and date.
    t.is(
      new Date(parseDateHTTP('Sat, 08 Aug 2020 16:08:24 GMT')).toISOString(),
      '2020-08-08T16:08:24.000Z'
    );
    t.is(
      new Date(parseDateOpenSSL('Aug 14 17:13:12 2020 GMT')).toISOString(),
      '2020-08-14T17:13:12.000Z'
    );

    // Wrong day of the week, which is ignored.
    t.is(
      new Date(parseDateHTTP('Tue, 08 Aug 2020 16:08:24 GMT')).toISOString(),
      '2020-08-08T16:08:24.000Z'
    );

    t.end();
  });

  // ===========================================================================

  t.test('@grr/http/Server', async t => {
    const checkSecurityHeaders = response => {
      t.is(response.get(ReferrerPolicy), 'origin-when-cross-origin');
      t.is(response.get(StrictTransportSecurity), 'max-age=86400');
      t.is(response.get(ContentTypeOptions), 'nosniff');
      t.is(response.get(FrameOptions), 'DENY');
      t.is(response.get(PermittedCrossDomainPolicies), 'none');
      t.is(response.get(XssProtection), '1; mode-block');
    };

    const testcases = [
      // -----------------------------------------------------------------------
      // (#1) An implicit GET /
      {
        async client(session) {
          const response = await session.request();

          t.is(response.status, Ok);
          t.is(response.get(Status), Ok);
          t.is(response.type, MediaType.PlainText);
          t.is(response.get(ContentType), MediaType.PlainText);
          t.is(response.length, 5);
          t.is(response.get(ContentLength), 5);
          t.is(response.body, 'first');
        },

        async server(context, next) {
          t.notOk(context.hasSentHeaders);
          t.notOk(context.isTerminated);
          t.notOk(context.isDisconnected);

          t.is(context.request.method, GET);
          t.is(context.request.path, '/');

          context.prepare('first');
          t.is(context.response.body, 'first');

          await next();
        },
      },

      // -----------------------------------------------------------------------
      // (#2) HEAD for a JSON response
      {
        async client(session) {
          const response = await session.request({
            [Method]: HEAD,
            [Path]: '/answer',
          });

          t.is(response.status, Ok);
          t.is(response.type, MediaType.Jason);
          t.is(response.length, 13);
          t.is(response.body, '');
        },

        async server(context, next) {
          t.is(context.request.method, HEAD);
          t.is(context.request.path, '/answer');
          context.prepare({ answer: 42 });

          await next();
        },
      },

      // -----------------------------------------------------------------------
      // (#3) GET for the same JSON response
      {
        async client(session) {
          const response = await session.request({ [Path]: '/answer' });

          t.is(response.status, Ok);
          t.is(response.type, MediaType.Jason);
          t.is(response.length, 13);
          t.is(response.body, '{"answer":42}');
        },

        async server(context, next) {
          t.is(context.request.method, GET);
          t.is(context.request.path, '/answer');
          context.prepare({ answer: 42 });

          await next();
        },
      },

      // -----------------------------------------------------------------------
      // (#4) A permanent redirect
      {
        async client(session) {
          const response = await session.request({ [Path]: '/some/page/' });

          t.ok(response instanceof Context.Response);
          t.is(response.status, 301);
          t.is(response.type, MediaType.HTML);
          t.is(response.get(PoweredBy), '12 Monkeys');

          const location = response.get(Location);
          t.ok(
            location === 'https://127.0.0.1:6651/some/page' ||
              location === 'https://[::ffff:7f00:1]:6651/some/page' ||
              location === 'https://localhost:6651/some/page'
          );
          const contentLength = 130 + 2 * location.length;
          t.is(response.length, contentLength);
          t.is(response.body.length, contentLength);

          checkSecurityHeaders(response);
        },

        async server(context, next) {
          const { request, response } = context;

          t.is(typeof request, 'object');
          t.ok(request instanceof Context.Request);
          t.is(request.path, '/some/page/');

          t.is(typeof response, 'object');
          t.ok(response instanceof Context.Response);
          // Thanks to the trailing slash, the request triggers the
          // redirectOnTrailingSlash() middleware.
          t.same(keysOf(response.headers), [
            Status,
            Location,
            ContentType,
            ContentLength,
          ]);

          t.is(response.status, MovedPermanently);
          t.is(response.type, MediaType.HTML);
          const location = response.get(Location);
          t.ok(location.endsWith('/some/page'));
          t.is(response.length, 130 + 2 * location.length);

          response.status = Teapot;
          t.is(response.status, Teapot);
          response.status = MovedPermanently;
          t.is(response.status, MovedPermanently);

          t.is(response.get(PoweredBy), undefined);
          response.set('x-powered-by', '12 Monkeys');
          t.is(response.get(PoweredBy), '12 Monkeys');

          const promise = next();
          t.type(promise, Promise);
          await promise;
        },
      },

      // -----------------------------------------------------------------------
      // (#5) A Thrown Error
      {
        async client(session) {
          const response = await session.request({ ':path': '/boo' });

          t.is(response.status, Teapot);
          t.is(response.type, MediaType.HTML);

          const { body } = response;
          t.ok(body.includes(`<h1>418 I'm a Teapot</h1>`));
          t.ok(body.includes(`<dt>:path</dt>${EOL}<dd>/boo</dd>`));
          t.ok(body.includes(`<p class=stack>Error: boo!<br>`));

          checkSecurityHeaders(response);
        },

        server() {
          throw Context.Error(Teapot, 'boo!');
        },
      },
    ];

    let client, server;
    try {
      const { authority, cert, key } = await prepareSecrets();
      const options = { authority, port, cert, key, ca: cert, logger };

      let serverIndex = -1;
      server = new Server(options)
        .route(Server.scaffold)
        .route(Server.redirectOnTrailingSlash)
        .route((context, next) => {
          const current = ++serverIndex;
          logger.debug(`Did receive request #${current + 1}`);
          testcases[current].server(context, next);
          logger.debug(`About to send response #${current + 1}`);
        });
      await server.listen();

      let clientIndex = -1;
      client = await Client.connect(options);
      for (const testcase of testcases) {
        const current = ++clientIndex;
        logger.debug(`About to send request #${current + 1}`);
        await testcase.client(client);
        logger.debug(`Did receive response #${current + 1}`);
        logger.debug(
          `-------------------------------------------------------------`
        );
      }
    } finally {
      cleanupEndpoints(client, server);
    }

    t.end();
  });

  // ===========================================================================

  t.test('@grr/http/makeEventSource', async t => {
    const EVENT_SOURCE_ORIGIN = 'https://localhost:6651';
    const EVENT_SOURCE_PATH = '/.well-known/server-events';

    let client, server;
    try {
      const eventSource = Server.makeEventSource();
      t.is(typeof eventSource, 'function');
      t.is(typeof eventSource.ping, 'function');
      t.is(typeof eventSource.emit, 'function');
      t.is(typeof eventSource.close, 'function');

      const { authority, cert, key } = await prepareSecrets();
      const options = { authority, port, cert, key, ca: cert, logger };
      server = new Server(options)
        .route(Server.scaffold)
        .route(EVENT_SOURCE_PATH, eventSource);
      await server.listen();
      client = await Client.connect(options);

      setTimeout(() => {
        eventSource.emit({ event: 'greeting', id: 'boo' });
        eventSource.emit({ event: 'greeting', id: 'one', data: 'hello' });
        eventSource.emit({ id: 'two', data: ['', ''] });
        eventSource.close();
      }, 10);

      let count = 0;
      logger.debug(`About to subscribe to ${EVENT_SOURCE_PATH}`);
      for await (const event of client.subscribe(EVENT_SOURCE_PATH)) {
        logger.debug(
          `Received event #${++count} with type "${event.type}"` +
            ` and ID "${event.lastEventId}"`
        );

        switch (count) {
          case 1:
            t.is(event.origin, EVENT_SOURCE_ORIGIN);
            t.is(event.type, 'greeting');
            t.is(event.lastEventId, 'one');
            t.is(event.data, 'hello');
            break;
          case 2:
            t.is(event.origin, EVENT_SOURCE_ORIGIN);
            t.is(event.type, 'message');
            t.is(event.lastEventId, 'two');
            t.is(event.data, '\n');
            break;
          default:
            t.fail();
        }

        if (count === 2) break;
      }

      eventSource.close();
      logger.debug(
        `-------------------------------------------------------------`
      );
    } finally {
      cleanupEndpoints(client, server);
    }

    t.end();
  });

  // ===========================================================================

  t.test('@grr/http/Server.makeServeStaticAsset', async t => {
    // Set up tests
    // ------------

    const root = fileURLToPath(new URL('fixtures/content', import.meta.url));
    const tests = [
      {
        path: '/amanda-gris.css',
        type: MediaType.CSS,
        length: 0,
        content: 'amanda-gris.css',
      },
      {
        path: '/la-flor',
        type: MediaType.HTML,
        length: 0,
        content: 'la-flor.html',
      },
      {
        path: '/mujeres',
        type: MediaType.HTML,
        length: 0,
        content: 'mujeres/index.html',
      },
      {
        path: '/almodovar.js',
        status: NotFound,
        type: MediaType.HTML,
      },
    ];

    for (const test of tests) {
      if (test.content) {
        test.content = await readFile(join(root, test.content), 'utf8');
        test.length = byteLength(test.content);
      }
    }

    // Run tests
    // ---------

    let client, server;
    try {
      const { authority, cert, key } = await prepareSecrets();
      const options = { authority, port, cert, key, ca: cert, logger };

      server = new Server(options)
        .route(Server.scaffold)
        .route(Server.redirectOnTrailingSlash)
        .route(Server.makeServeStaticAsset({ root }));
      await server.listen();

      client = await Client.connect(options);

      let index = 0;
      for (const test of tests) {
        const current = ++index;
        logger.debug(`About to send request #${current}`);
        const response = await client.request({
          [Method]: GET,
          [Path]: test.path,
        });
        logger.debug(`Did receive response #${current}`);
        logger.debug(
          `-------------------------------------------------------------`
        );

        t.is(response.status, test.status ?? Ok);
        t.is(response.type, test.type);
        if (test.length) t.is(response.length, test.length);
        if (test.content) t.ok(response.body, test.content);
      }
    } finally {
      cleanupEndpoints(client, server);
    }

    t.end();
  });

  t.end();
});
