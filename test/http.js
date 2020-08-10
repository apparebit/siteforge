/* © 2020 Robert Grimm */

import { constants } from 'http2';
import { EOL } from 'os';
import { fileURLToPath } from 'url';
import harness from './harness.js';
import { promises } from 'fs';

import {
  connect,
  createPathHandler,
  createServerEventHandler,
  createStaticContentHandler,
  events,
  identifyHttp2Stream,
  identifyLocal,
  MediaType,
  parseDate,
  parsePath,
  refreshen,
  Server,
} from '@grr/http';

const { byteLength } = Buffer;
const { keys: keysOf } = Object;
const { readFile } = promises;

const ContentType = constants.HTTP2_HEADER_CONTENT_TYPE;
const ContentLength = constants.HTTP2_HEADER_CONTENT_LENGTH;

const { Any, Audio, Image, Text, Video } = MediaType;
const AudioMp4 = MediaType('audio', 'mp4');
const ImagePng = MediaType('image', 'png');
const ImageSvg = MediaType('image', 'svg+xml');
const TextPlain = MediaType('text', 'plain');
const TextHtml = MediaType('text', 'html');
const VideoMp4 = MediaType('video', 'mp4');
const VideoWebm = MediaType('video', 'webm');

const TextPlainUtf8 = TextPlain.with({ charset: 'UTF-8' });
const TextPlainUtf8FixedFormat = TextPlain.with({
  charset: 'UTF-8',
  format: 'fixed',
});

const prepareSecrets = async () => {
  const openssl = '/usr/local/opt/openssl/bin/openssl';
  const path = fileURLToPath(new URL('../tls', import.meta.url));
  const secrets = await refreshen({ openssl, path });
  secrets.authority = 'https://localhost:6651';
  return secrets;
};

harness.test('@grr/http', t => {
  t.test('@grr/http/MediaType', t => {
    // ----------------------------------------------------- MediaType.unquote()
    t.throws(() => MediaType.unquote('#boo#'));
    t.is(MediaType.unquote(`""`), ``);
    t.is(MediaType.unquote(`"boo"`), `boo`);
    t.is(MediaType.unquote(`"\\"\\\\\\""`), `"\\"`);
    t.is(
      MediaType.unquote(`"text\\"text\\\\text\\"text"`),
      `text"text\\text"text`
    );
    t.is(MediaType.unquote(`"text`), `text`);
    t.is(MediaType.unquote(`"text\\`), `text\\`);

    // ---------------------------------------------------------- MediaType.of()
    t.is(MediaType.of(``), undefined);
    t.is(MediaType.of(`boo`), undefined);
    t.is(MediaType.of(`boo/`), undefined);
    t.is(MediaType.of(`/boo`), undefined);
    t.is(MediaType.of(`boo/`), undefined);
    t.is(MediaType.of(`b(o)o/boo`), undefined);
    t.is(MediaType.of(`boo/b(o)o`), undefined);

    t.same(MediaType.of('audio/mp4'), AudioMp4);
    t.same(MediaType.of('audio/mp4   '), AudioMp4);
    t.same(MediaType.of('text/plain ; charset'), TextPlain);

    t.same(MediaType.of('text/plain; charset; charset=utf-8'), TextPlainUtf8);
    t.same(MediaType.of('text/plain; charset=; charset=uTF-8'), TextPlainUtf8);
    t.same(MediaType.of('text/plain; CHARset="UTF-8"'), TextPlainUtf8);

    t.same(
      MediaType.of('text/PLAIN; charset="utf-8"; format=fixed'),
      TextPlainUtf8FixedFormat
    );
    t.same(
      MediaType.of('TEXT/plain; CHARSET="utf-8"; FORMAT=FIXED'),
      TextPlain.with({ charset: 'UTF-8', format: 'FIXED' })
    );

    // ----------------------------------------------------- MediaType.compare()
    const cmt = MediaType.compare;

    t.is(cmt(VideoMp4, AudioMp4.with({ q: 0.5 })), -0.5);
    t.is(cmt(Any.with({ q: 0.2 }), Audio.with({ q: 0.4 })), 1);
    t.is(cmt(Audio.with({ q: 0.4 }), Any.with({ q: 0.2 })), -1);
    t.is(cmt(Any.with({ q: 0.2 }), AudioMp4.with({ q: 0.4 })), 2);
    t.is(cmt(AudioMp4.with({ q: 0.4 }), Any.with({ q: 0.2 })), -2);
    t.is(cmt(Any.with({ q: 0.2 }), TextPlainUtf8.with({ q: 0.4 })), 3);
    t.is(cmt(TextPlainUtf8.with({ q: 0.4 }), Any.with({ q: 0.2 })), -3);
    t.is(cmt(TextPlain.with({ q: 0.2 }), TextHtml.with({ q: 0.4 })), 0.2);
    t.is(cmt(TextHtml.with({ q: 0.4 }), TextPlain.with({ q: 0.2 })), -0.2);
    t.is(cmt(AudioMp4, VideoMp4), 0);
    t.is(cmt(VideoMp4, AudioMp4), 0);
    t.is(cmt(Any, Any), 0);
    t.is(cmt(Any, Video), 1);
    t.is(cmt(Video, Any), -1);
    t.is(cmt(Video, VideoMp4), 1);
    t.is(cmt(VideoMp4, Video), -1);
    t.is(cmt(VideoMp4, VideoWebm), 0);
    t.is(cmt(VideoWebm, VideoMp4), 0);
    t.is(cmt(ImagePng, ImageSvg), 0);
    t.is(cmt(ImageSvg, ImagePng), 0);
    t.is(cmt(Image, Image), 0);
    t.is(cmt(TextPlainUtf8, TextPlainUtf8), 0);
    t.is(cmt(TextPlainUtf8FixedFormat, TextPlain), -1);
    t.is(cmt(TextPlainUtf8FixedFormat, TextPlainUtf8), 0);
    t.is(cmt(TextPlain, TextPlainUtf8), 1);
    t.is(cmt(TextPlain, TextPlainUtf8FixedFormat), 1);

    // ------------------------------------------------------ MediaType.ranges()
    t.same(
      MediaType.accept('text/html, text/plain; q=0.7, text/*, */*;q=0.1'),
      [TextHtml, TextPlain.with({ q: 0.7 }), Text, Any.with({ q: 0.1 })]
    );

    t.same(
      MediaType.accept(
        'text/*, text/plain; q=0.7,/plain, */*;   q=0.1, text/html'
      ),
      [TextHtml, TextPlain.with({ q: 0.7 }), Text, Any.with({ q: 0.1 })]
    );

    t.same(
      MediaType.accept(
        `*/*, ` +
          `text/plain, ` +
          `text/plain; charset=UTF-8; format=fixed, ` +
          `text/plain; charset=utf8, ` +
          `text/*`
      ),
      [TextPlainUtf8FixedFormat, TextPlainUtf8, TextPlain, Text, Any]
    );

    t.same(
      MediaType.accept(
        `*/*; q=0.1, ` +
          `text/plain; q=0.5, ` +
          `text/plain; charset=UTF-8; format=fixed; q=0.8, ` +
          `text/plain; charset=utf8, ` +
          `text/*; q=0.2`
      ),
      [
        TextPlainUtf8,
        TextPlainUtf8FixedFormat.with({ q: 0.8 }),
        TextPlain.with({ q: 0.5 }),
        Text.with({ q: 0.2 }),
        Any.with({ q: 0.1 }),
      ]
    );

    // --------------------------------------------------------------- matches()
    t.ok(TextPlain.matches(Any));
    t.notOk(TextPlain.matches(Video));
    t.ok(VideoMp4.matches(Video));
    t.notOk(TextPlain.matches(VideoMp4));
    t.ok(VideoMp4.matches(VideoMp4));
    t.ok(MediaType.matches({ type: 'video', subtype: 'mp4' }, VideoMp4));
    t.ok(VideoMp4.matches({ type: 'video', subtype: 'mp4' }));
    t.ok(TextPlain.matches(TextPlain));
    t.ok(TextPlain.matches(TextPlainUtf8));
    t.ok(TextPlainUtf8.matches(TextPlainUtf8));
    t.ok(MediaType.of('text/plain;CHARSET=utf8').matches(TextPlainUtf8));
    t.ok(MediaType.of('text/plain;CHARSET="utf8"').matches(TextPlainUtf8));
    t.ok(TextPlain.with({ charset: 'UTF-8' }).matches(TextPlainUtf8));
    t.notOk(TextPlain.with({ charset: 'US-ASCII' }).matches(TextPlainUtf8));
    t.ok(TextPlainUtf8.matches(TextPlain));
    t.ok(TextPlainUtf8.matches(Text));
    t.notOk(VideoMp4.matches(TextPlainUtf8));
    t.notOk(VideoMp4.matches(TextPlain));
    t.notOk(VideoMp4.matches(Text));
    t.ok(VideoMp4.matches(Any));

    // ------------------------------------------------------ MediaType.render()
    t.is(Any.toString(), '*/*');
    t.is(Text.toString(), 'text/*');
    t.is(TextPlain.toString(), 'text/plain');
    t.is(TextPlainUtf8.toString(), 'text/plain; charset=UTF-8');
    t.is(MediaType.render({ type: '*', subtype: '*' }), '*/*');
    t.is(MediaType.render({ type: 'text', subtype: '*' }), 'text/*');
    t.is(MediaType.render({ type: 'text', subtype: 'plain' }), 'text/plain');
    t.is(
      MediaType.render({
        type: 'text',
        subtype: 'plain',
        parameters: { charset: 'UTF-8' },
      }),
      'text/plain; charset=UTF-8'
    );

    t.end();
  });

  // ===========================================================================

  t.test('@grr/http/parse-util', t => {
    t.throws(() => parsePath('?query'));
    t.throws(() => parsePath('/a%2fb'));
    t.throws(() => parsePath('a/b.html'));

    t.same(parsePath('/'), {
      rawPath: '/',
      rawQuery: '',
      path: '/',
      endsInSlash: false,
    });

    t.same(parsePath('/a////b/./../../././../a/b/c.html?some-query'), {
      rawPath: '/a////b/./../../././../a/b/c.html',
      rawQuery: '?some-query',
      path: '/a/b/c.html',
      endsInSlash: false,
    });

    t.same(parsePath('/a/%2e/b/%2e%2e/file.json/#anchor'), {
      rawPath: '/a/%2e/b/%2e%2e/file.json/',
      rawQuery: '',
      path: '/a/file.json',
      endsInSlash: true,
    });

    t.end();
  });

  // ===========================================================================

  t.test('@grr/http/identify', t => {
    t.is(
      identifyLocal({
        localAddress: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        localFamily: 'IPv6',
        localPort: 42,
      }),
      '[2001:0db8:85a3:0000:0000:8a2e:0370:7334]:42'
    );

    t.is(
      identifyHttp2Stream({
        id: 665,
        session: {
          socket: {
            remoteAddress: '127.0.0.1',
            remoteFamily: 'IPv4',
            remotePort: 13,
          },
        },
      }),
      'https://127.0.0.1:13/#665'
    );

    t.end();
  });

  // ===========================================================================

  t.test('@grr/http/parseDate', t => {
    t.is(parseDate(), undefined);
    t.is(parseDate('Sat, 08 Aug 2020 16:08:24 EST'), undefined);
    t.is(
      parseDate('Sat, 08 Aug 2020 16:08:24 GMT').toISOString(),
      '2020-08-08T16:08:24.000Z'
    );

    t.end();
  });

  // ===========================================================================

  t.test('@grr/http/Server', async t => {
    const checkSecurityHeaders = response => {
      t.is(response['referrer-policy'], 'origin-when-cross-origin');
      t.is(response['strict-transport-security'], 'max-age=86400');
      t.is(response['x-content-type-options'], 'nosniff');
      t.is(response['x-frame-options'], 'DENY');
      t.is(response['x-permitted-cross-domain-policies'], 'none');
      t.is(response['x-xss-protection'], '1; mode-block');
    };

    const testcases = [
      // -----------------------------------------------------------------------
      // An implicit GET /
      {
        async client(session) {
          const response = await session.request();

          t.is(response[':status'], 200);
          t.is(response[ContentType], 'text/plain; charset=UTF-8');
          t.is(response[ContentLength], 5);
          t.is(response[':body'], 'first');
        },

        async server(exchange, next) {
          t.ok(exchange.isReady());
          t.notOk(exchange.isResponding());
          t.notOk(exchange.isDone());
          t.is(exchange.method, 'GET');
          t.is(exchange.path, '/');
          t.notOk(exchange.endsInSlash);

          exchange.body('first', MediaType.PlainText);
          t.is(exchange.getBody(), 'first');

          const done = next();
          t.notOk(exchange.isReady());
          t.ok(exchange.isResponding());
          t.notOk(exchange.isDone());

          await done;
          t.notOk(exchange.isReady());
          t.notOk(exchange.isResponding());
          t.ok(exchange.isDone());
        },
      },

      // -----------------------------------------------------------------------
      // HEAD for a JSON response
      {
        async client(session) {
          const response = await session.request({
            ':method': 'HEAD',
            ':path': '/answer',
          });

          t.is(response[':status'], 200);
          t.is(response[ContentType], 'application/json; charset=UTF-8');
          t.is(response[ContentLength], 13);
          t.is(response[':body'], '');
        },

        server(exchange, next) {
          t.is(exchange.method, 'HEAD');
          t.is(exchange.path, '/answer');

          exchange.json({ answer: 42 });
          return next();
        },
      },

      // -----------------------------------------------------------------------
      // GET for the same JSON response
      {
        async client(session) {
          const response = await session.request({ ':path': '/answer' });

          t.is(response[':status'], 200);
          t.is(response[ContentType], 'application/json; charset=UTF-8');
          t.is(response[ContentLength], 13);
          t.is(response[':body'], '{"answer":42}');
        },

        server(exchange, next) {
          t.is(exchange.method, 'GET');
          t.is(exchange.path, '/answer');

          exchange.json({ answer: 42 });
          return next();
        },
      },

      // -----------------------------------------------------------------------
      // A permanent redirect
      {
        async client(session) {
          const response = await session.request({ ':path': '/some/page/' });

          t.is(response[':status'], 301);
          t.is(response['content-type'], 'text/html; charset=UTF-8');
          t.is(response['x-powered-by'], '12 Monkeys');

          const location = response['location'];
          t.ok(
            location === 'https://127.0.0.1:6651/some/page' ||
              location === 'https://[::ffff:7f00:1]:6651/some/page' ||
              location === 'https://localhost:6651/some/page'
          );
          const contentLength = 130 + 2 * location.length;
          t.is(Number(response['content-length']), contentLength);
          t.is(response[':body'].length, contentLength);

          checkSecurityHeaders(response);
        },

        server(exchange, next) {
          t.is(exchange.path, '/some/page');
          t.ok(exchange.endsInSlash);

          t.is(typeof exchange.request, 'object');
          t.is(exchange.request[':path'], '/some/page/');

          t.is(typeof exchange.response, 'object');
          t.is(keysOf(exchange.response).join(','), '');

          t.is(exchange.status, undefined);
          exchange.status = 418;
          t.is(exchange.status, 418);

          t.is(exchange.type, undefined);
          exchange.type = MediaType.Binary;
          t.is(exchange.type, MediaType.Binary);

          t.is(exchange.length, undefined);
          exchange.length = 665;
          t.is(exchange.length, 665);
          exchange.setResponseHeader('content-length', 42);
          t.is(exchange.length, 42);
          exchange.deleteResponseHeader('content-length');
          t.is(exchange.length, undefined);

          t.is(exchange.getResponseHeader('x-powered-by'), undefined);
          exchange.ooh();
          t.is(exchange.getResponseHeader('x-powered-by'), 'George Soros');
          exchange.setResponseHeader('x-powered-by', '12 Monkeys');

          // redirect() is async and thus should be await'ed for. Without that,
          // control flows into next() and then respond(). In other words, this
          // does test whether respond() tolerates repeated invocation.
          exchange.redirect(301, exchange.origin + exchange.path);
          return next();
        },
      },

      // -----------------------------------------------------------------------
      // An Error
      {
        async client(session) {
          const response = await session.request({ ':path': '/boo' });

          t.is(response[':status'], 418);
          t.is(response['content-type'], 'text/html; charset=UTF-8');

          const body = response[':body'];
          t.ok(body.includes(`<h1>418 I'm a Teapot</h1>`));
          t.ok(body.includes(`<dt>:path</dt>${EOL}<dd>/boo</dd>`));
          t.ok(body.includes(`<p>Error: boo!<br>`));

          checkSecurityHeaders(response);
        },

        async server(exchange, next) {
          await exchange.fail(418, new Error('boo!'));
          await next();
        },
      },
    ];

    let client, server;
    try {
      const { authority, cert, key } = await prepareSecrets();
      server = new Server({ cert, key, port: 6651 });

      let index = -1;
      server.use((exchange, next) => testcases[++index].server(exchange, next));
      await server.listen();

      client = connect({ authority, ca: cert });
      await client.didConnect();

      for (const testcase of testcases) {
        await testcase.client(client);
      }
    } finally {
      if (client) await client.disconnect();
      if (server) await server.stop();
    }

    t.end();
  });

  // ===========================================================================

  t.test('@grr/http/createServerEventHandler', async t => {
    let client, server;
    try {
      // Set up SSE middleware.
      const handleSSE = createServerEventHandler();
      const handleEvents = createPathHandler('/.well-known/alerts', handleSSE, {
        exact: true,
      });

      t.is(handleEvents.name, 'handleServerEvents');
      t.is(handleEvents.name, handleSSE.name);
      t.is(handleEvents.emit, handleSSE.emit);
      t.is(handleEvents.close, handleSSE.close);

      // Set up server hosting middleware.
      const { authority, cert, key } = await prepareSecrets();
      server = new Server({ cert, key, port: 6651 });
      server.use(handleEvents);
      await server.listen();

      // Schedule events to be sent.
      setTimeout(() => handleSSE.emit({ id: 665, data: 'yo!' }), 50);
      setTimeout(() => handleEvents.emit({ event: 'yell', data: 'damn!' }), 50);
      setTimeout(() => handleSSE.close(), 100);

      // Set up client and consume events.
      client = connect({ authority, ca: cert });
      await client.didConnect();

      let count = 0;
      for await (const event of events(client.session, '/.well-known/alerts')) {
        switch (++count) {
          case 1:
            t.is(event.data, undefined);
            t.is(event.event, undefined);
            t.is(event.id, undefined);
            t.is(event.retry, '500');
            break;
          case 2:
            t.is(event.data, 'yo!');
            t.is(event.event, undefined);
            t.is(event.id, '665');
            t.is(event.retry, undefined);
            break;
          case 3:
            t.is(event.data, 'damn!');
            t.is(event.event, 'yell');
            t.is(event.id, undefined);
            t.is(event.retry, undefined);
            break;
          default:
            t.fail();
        }
      }
    } finally {
      if (client) await client.disconnect();
      if (server) await server.stop();
    }

    t.end();
  });

  // ===========================================================================

  t.test('@grr/http/createStaticContentHandler', async t => {
    let client, server;
    try {
      // Set up server with static content middleware.
      const root = fileURLToPath(new URL('fixtures/content', import.meta.url));
      const handleStaticContent = createStaticContentHandler({ root });
      const { authority, cert, key } = await prepareSecrets();
      server = new Server({ cert, key, port: 6651 });
      server.use(handleStaticContent);
      await server.listen();

      // Set up client and initiate tests.
      client = connect({ authority, ca: cert });
      await client.didConnect();

      // Set up tests
      // ============

      const tests = [
        {
          path: '/amanda-gris.css',
          type: MediaType.CSS,
          length: 0,
          content: '/amanda-gris.css',
        },
        {
          path: '/la-flor',
          type: MediaType.HTML,
          length: 0,
          content: '/la-flor.html',
        },
        {
          path: '/mujeres',
          type: MediaType.HTML,
          length: 0,
          content: '/mujeres/index.html',
        },
      ];

      for (const test of tests) {
        test.content = await readFile(root + test.content, 'utf8');
        test.length = byteLength(test.content);
      }

      // Run tests
      // =========

      for (const test of tests) {
        const response = await client.request({
          ':method': 'GET',
          ':path': test.path,
        });

        t.is(response[':status'], 200);
        t.is(response['content-type'], test.type.toString());
        t.is(response['content-length'], test.length);
        t.ok(response[':body'], test.content);
      }
    } finally {
      if (client) await client.disconnect();
      if (server) await server.stop();
    }

    t.end();
  });

  t.end();
});
