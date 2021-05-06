/* © 2020 Robert Grimm */

import { createReadStream, promises } from 'fs';
import { EOL } from 'os';
import { fileURLToPath } from 'url';
import harness from './harness.js';
import { join } from 'path';

import {
  Client,
  Context,
  Header,
  identifyEndpoint,
  MediaType,
  MethodName,
  Middleware,
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
      await server.close();
    } catch (x) {
      harness.rollcall.error('Error shutting down server', x);
    }
  }
};

harness.test('@grr/http', t => {
  t.test('@grr/http/MediaType', t => {
    // ----------------------------------------------------- MediaType.unquote()
    t.throws(() => MediaType.unquote('#boo#'));
    t.equal(MediaType.unquote(`""`).value, ``);
    t.equal(MediaType.unquote(`"boo"`).value, `boo`);
    t.equal(MediaType.unquote(`"\\"\\\\\\""`).value, `"\\"`);
    t.equal(
      MediaType.unquote(`"text\\"text\\\\text\\"text"`).value,
      `text"text\\text"text`
    );
    t.equal(MediaType.unquote(`"text`).value, `text`);
    t.equal(MediaType.unquote(`"text\\`).value, `text\\`);

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
    t.equal(css, MediaType.CSS);
    t.equal(css.parameters.charset, 'UTF-8');
    t.equal(MediaType.from('text/css'), MediaType.CSS);

    // ------------------------------------------- MediaType.prototype.compare()

    t.equal(
      MediaType.VideoMP4.compareTo(MediaType.AudioMP4.with({ q: 0.5 })),
      -0.5
    );
    t.equal(
      MediaType.Any.with({ q: 0.2 }).compareTo(
        MediaType.Audio.with({ q: 0.4 })
      ),
      1
    );
    t.equal(
      MediaType.Audio.with({ q: 0.4 }).compareTo(
        MediaType.Any.with({ q: 0.2 })
      ),
      -1
    );
    t.equal(
      MediaType.Any.with({ q: 0.2 }).compareTo(
        MediaType.AudioMP4.with({ q: 0.4 })
      ),
      2
    );
    t.equal(
      MediaType.AudioMP4.with({ q: 0.4 }).compareTo(
        MediaType.Any.with({ q: 0.2 })
      ),
      -2
    );
    t.equal(
      MediaType.Any.with({ q: 0.2 }).compareTo(
        MediaType.PlainText.with({ q: 0.4 })
      ),
      3
    );
    t.equal(
      MediaType.PlainText.with({ q: 0.4 }).compareTo(
        MediaType.Any.with({ q: 0.2 })
      ),
      -3
    );
    t.equal(
      MediaType.PlainText.with({ q: 0.2 }).compareTo(
        MediaType.HTML.with({ q: 0.4 })
      ),
      0.2
    );
    t.equal(
      MediaType.HTML.with({ q: 0.4 }).compareTo(
        MediaType.PlainText.with({ q: 0.2 })
      ),
      -0.2
    );
    t.equal(MediaType.AudioMP4.compareTo(MediaType.VideoMP4), 0);
    t.equal(MediaType.VideoMP4.compareTo(MediaType.AudioMP4), 0);
    t.equal(MediaType.Any.compareTo(MediaType.Any), 0);
    t.equal(MediaType.Any.compareTo(MediaType.Video), 1);
    t.equal(MediaType.Video.compareTo(MediaType.Any), -1);
    t.equal(MediaType.Video.compareTo(MediaType.VideoMP4), 1);
    t.equal(MediaType.VideoMP4.compareTo(MediaType.Video), -1);
    t.equal(MediaType.VideoMP4.compareTo(MediaType.H264), 0);
    t.equal(MediaType.H264.compareTo(MediaType.VideoMP4), 0);
    t.equal(MediaType.PNG.compareTo(MediaType.SVG), 0);
    t.equal(MediaType.SVG.compareTo(MediaType.PNG), 0);
    t.equal(MediaType.Image.compareTo(MediaType.Image), 0);
    t.equal(MediaType.PlainText.compareTo(MediaType.PlainText), 0);
    t.equal(
      MediaType.PlainText.with({ formed: 'fixed' }).compareTo(
        MediaType.PlainText
      ),
      -1
    );
    t.equal(
      MediaType.PlainText.with({ formed: 'fixed' }).compareTo(
        BareType.PlainText
      ),
      -2
    );
    t.equal(BareType.PlainText.compareTo(MediaType.PlainText), 1);
    t.equal(MediaType.PlainText.compareTo(BareType.PlainText), -1);

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
    t.equal(MediaType.Any.toString(), '*/*');
    t.equal(MediaType.Text.toString(), 'text/*');
    t.equal(BareType.PlainText.toString(), 'text/plain');
    t.equal(MediaType.PlainText.toString(), 'text/plain; charset=UTF-8');

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

    t.equal(
      identifyEndpoint({
        address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        family: 'IPv6',
        port: 42,
      }),
      '[2001:0db8:85a3:0000:0000:8a2e:0370:7334]:42'
    );

    t.equal(
      identifyEndpoint({
        address: '127.0.0.1',
        family: 'IPv4',
        port: 13,
      }),
      '127.0.0.1:13'
    );

    // -------------------------------------------------------------------------
    // Nothing to parse.
    t.equal(parseDateHTTP(), undefined);
    t.equal(parseDateOpenSSL(), undefined);

    // Timezone other than GMT.
    t.equal(parseDateHTTP('Sat, 08 Aug 2020 16:08:24 EST'), undefined);
    t.equal(parseDateOpenSSL('Aug 14 17:13:12 2020 EST'), undefined);

    // Perfectly valid time and date.
    t.equal(
      new Date(parseDateOpenSSL('Sep 28 07:52:21 2019 GMT')).toISOString(),
      '2019-09-28T07:52:21.000Z'
    );
    t.equal(
      new Date(parseDateOpenSSL('Oct 28 07:52:21 2019 GMT')).toISOString(),
      '2019-10-28T07:52:21.000Z'
    );
    t.equal(
      new Date(parseDateHTTP('Sat, 08 Aug 2020 16:08:24 GMT')).toISOString(),
      '2020-08-08T16:08:24.000Z'
    );
    t.equal(
      new Date(parseDateOpenSSL('Aug 14 17:13:12 2020 GMT')).toISOString(),
      '2020-08-14T17:13:12.000Z'
    );

    // Wrong day of the week, which is ignored.
    t.equal(
      new Date(parseDateHTTP('Tue, 08 Aug 2020 16:08:24 GMT')).toISOString(),
      '2020-08-08T16:08:24.000Z'
    );

    t.end();
  });

  // ===========================================================================

  t.test('@grr/http/Server', async t => {
    const checkSecurityHeaders = response => {
      t.equal(response.get(ReferrerPolicy), 'origin-when-cross-origin');
      t.equal(response.get(StrictTransportSecurity), 'max-age=86400');
      t.equal(response.get(ContentTypeOptions), 'nosniff');
      t.equal(response.get(FrameOptions), 'DENY');
      t.equal(response.get(PermittedCrossDomainPolicies), 'none');
      t.equal(response.get(XssProtection), '1; mode=block');
    };

    const testcases = [
      // -----------------------------------------------------------------------
      // (#1) An implicit GET /
      {
        async client(session) {
          const response = await session.request();

          t.equal(response.status, Ok);
          t.equal(response.get(Status), Ok);
          t.equal(response.type, MediaType.PlainText);
          t.equal(response.get(ContentType), MediaType.PlainText);
          t.equal(response.length, 5);
          t.equal(response.get(ContentLength), 5);
          t.equal(response.body, 'first');
        },

        async server(context, next) {
          t.notOk(context.hasSentHeaders);
          t.notOk(context.isTerminated);

          t.equal(context.request.method, GET);
          t.equal(context.request.path, '/');

          context.prepare('first');
          t.equal(context.response.body, 'first');

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

          t.equal(response.status, Ok);
          t.equal(response.type, MediaType.Jason);
          t.equal(response.length, 13);
          t.equal(response.body, '');
        },

        async server(context, next) {
          t.equal(context.request.method, HEAD);
          t.equal(context.request.path, '/answer');
          context.prepare({ answer: 42 });

          await next();
        },
      },

      // -----------------------------------------------------------------------
      // (#3) GET for the same JSON response
      {
        async client(session) {
          const response = await session.request({ [Path]: '/answer' });

          t.equal(response.status, Ok);
          t.equal(response.type, MediaType.Jason);
          t.equal(response.length, 13);
          t.equal(response.body, '{"answer":42}');
        },

        async server(context, next) {
          t.equal(context.request.method, GET);
          t.equal(context.request.path, '/answer');
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
          t.equal(response.status, 301);
          t.equal(response.type, MediaType.HTML);
          t.equal(response.get(PoweredBy), '12 Monkeys');

          const location = response.get(Location);
          t.ok(
            location === 'https://127.0.0.1:6651/some/page' ||
              location === 'https://[::ffff:7f00:1]:6651/some/page' ||
              location === 'https://localhost:6651/some/page'
          );
          const contentLength = 130 + 2 * location.length;
          t.equal(response.length, contentLength);
          t.equal(response.body.length, contentLength);

          checkSecurityHeaders(response);
        },

        async server(context, next) {
          const promise = next();
          t.type(promise, Promise);
          await promise;

          const { request, response } = context;

          t.equal(typeof request, 'object');
          t.ok(request instanceof Context.Request);
          t.equal(request.path, '/some/page/');

          t.equal(typeof response, 'object');
          t.ok(response instanceof Context.Response);
          // Thanks to the trailing slash, the request triggers the
          // redirectOnTrailingSlash() middleware.
          t.same(keysOf(response.headers), [
            Status,
            Location,
            ContentType,
            ContentLength,
          ]);

          t.equal(response.status, MovedPermanently);
          t.equal(response.type, MediaType.HTML);
          const location = response.get(Location);
          t.ok(location.endsWith('/some/page'));
          t.equal(response.length, 130 + 2 * location.length);

          response.status = Teapot;
          t.equal(response.status, Teapot);
          response.status = MovedPermanently;
          t.equal(response.status, MovedPermanently);

          t.equal(response.get(PoweredBy), undefined);
          response.set('x-powered-by', '12 Monkeys');
          t.equal(response.get(PoweredBy), '12 Monkeys');
        },
      },

      // -----------------------------------------------------------------------
      // (#5) A Thrown Error
      {
        async client(session) {
          const response = await session.request({ ':path': '/boo' });

          t.equal(response.status, Teapot);
          t.equal(response.type, MediaType.HTML);

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
        .route(Middleware.scaffold())
        .route((context, next) => {
          const current = ++serverIndex;
          logger.debug(`Did receive request #${current + 1}`);
          testcases[current].server(context, next);
          logger.debug(`About to send response #${current + 1}`);
        })
        .route(Middleware.redirectOnTrailingSlash());
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

  t.test('@grr/http/middleware/eventSource', async t => {
    const EVENT_SOURCE_ORIGIN = 'https://localhost:6651';
    const EVENT_SOURCE_PATH = '/.well-known/server-events';

    let client, server;
    try {
      const eventSource = Middleware.eventSource();
      t.equal(typeof eventSource, 'function');
      t.equal(typeof eventSource.ping, 'function');
      t.equal(typeof eventSource.emit, 'function');
      t.equal(typeof eventSource.close, 'function');

      const { authority, cert, key } = await prepareSecrets();
      const options = { authority, port, cert, key, ca: cert, logger };
      server = new Server(options)
        .route(Middleware.scaffold())
        .route(EVENT_SOURCE_PATH, eventSource);
      await server.listen();
      client = await Client.connect(options);

      // The server emits three events. Yet the client only yields two events.
      // That is consistent with the WhatWG specification since the first sent
      // event has no data and thus is dropped by the client.
      setTimeout(() => {
        eventSource.emit({ event: 'greeting', id: 'boo' });
        eventSource.emit({ event: 'greeting', id: 'one', data: 'hello' });
        eventSource.emit({ id: 'two', data: ['', ''] });
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
            t.equal(event.origin, EVENT_SOURCE_ORIGIN);
            t.equal(event.type, 'greeting');
            t.equal(event.lastEventId, 'one');
            t.equal(event.data, 'hello');
            break;
          case 2:
            t.equal(event.origin, EVENT_SOURCE_ORIGIN);
            t.equal(event.type, 'message');
            t.equal(event.lastEventId, 'two');
            t.equal(event.data, '\n');
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

  t.test('@grr/http/middleware/satisfyFromFileSystem', async t => {
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
        .route(Middleware.scaffold())
        .route(Middleware.redirectOnTrailingSlash())
        .route(Middleware.satisfyFromFileSystem({ root }));
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

        t.equal(response.status, test.status ?? Ok);
        t.equal(response.type, test.type);
        if (test.length) t.equal(response.length, test.length);
        if (test.content) t.ok(response.body, test.content);
      }
    } finally {
      cleanupEndpoints(client, server);
    }

    t.end();
  });

  t.test('@grr/http/middleware/createAppendToBody', t => {
    const transform = Middleware.createAppendToBody('waldo');

    t.equal(
      transform('<!DOCTYPE html><html lang=en><body></body></html>'),
      '<!DOCTYPE html><html lang=en><body>waldo</body></html>'
    );

    t.equal(
      transform('<!DOCTYPE html><html lang=en></html>'),
      '<!DOCTYPE html><html lang=en>waldo</html>'
    );

    t.equal(transform('hello '), 'hello waldo');
    t.end();
  });

  t.test('@grr/http/middleware/transformMatchingBodyText', async t => {
    const { authority, cert, key } = await prepareSecrets();
    const options = { authority, port, cert, key, ca: cert, logger };
    const root = fileURLToPath(new URL('fixtures/content', import.meta.url));
    const laFlor = join(root, 'la-flor.html');
    const BODY =
      '<!DOCTYPE html><title>La Flor</title>' +
      '<p>De Mi Secreto</p>\n<script src="/script.js"></script>';

    let client, server;
    try {
      server = new Server(options)
        .route(Middleware.scaffold())
        .route('/stream', async (context, next) => {
          const { response } = context;
          response.body = createReadStream(laFlor);
          response.type = MediaType.HTML;

          await next();
        })
        .route('/buffer', async (context, next) => {
          const { response } = context;
          response.body = await readFile(laFlor);
          response.type = MediaType.HTML;

          await next();
        })
        .route('/string', async (context, next) => {
          const { response } = context;
          response.body = await readFile(laFlor, 'utf8');
          response.type = MediaType.HTML;

          await next();
        })
        .route(
          Middleware.transformMatchingBodyText(
            MediaType.HTML,
            Middleware.createAppendToBody('<script src="/script.js"></script>')
          )
        );
      await server.listen();

      client = await Client.connect(options);

      let response = await client.request({ [Path]: '/stream' });
      t.equal(response.body, BODY);

      response = await client.request({ [Path]: '/buffer' });
      t.equal(response.body, BODY);

      response = await client.request({ [Path]: '/string' });
      t.equal(response.body, BODY);
    } finally {
      cleanupEndpoints(client, server);
    }

    t.end();
  });

  t.end();
});
