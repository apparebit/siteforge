/* © 2020 Robert Grimm */

import { fileURLToPath } from 'url';
import harness from './harness.js';
import { MediaType, parseRequestPath, refreshen } from '@grr/http';

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

harness.test('@grr/http', t => {
  t.test('MediaType()', t => {
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

    t.same(MediaType.of('text/plain'), TextPlain);
    t.same(MediaType.of('text/plain   '), TextPlain);
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

    // -------------------------------------------------------- matchMediaType()
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

  // -------------------------------------------------------- parseRequestPath()
  t.test('parseRequestPath()', t => {
    t.throws(() => parseRequestPath('?query'));
    t.throws(() => parseRequestPath('/a%2fb'));
    t.throws(() => parseRequestPath('a/b.html'));

    t.same(parseRequestPath('/'), {
      directory: '/',
      file: '',
      extension: '',
      path: '/',
      trailingSlash: false,
      queryAndHash: '',
    });

    t.same(parseRequestPath('/a////b/./../../././../a/b/c.html?some-query'), {
      directory: '/a/b',
      file: 'c',
      extension: '.html',
      path: '/a/b/c.html',
      trailingSlash: false,
      queryAndHash: '?some-query',
    });

    t.same(parseRequestPath('/a/%2e/b/%2e%2e/file.json#anchor'), {
      directory: '/a',
      file: 'file',
      extension: '.json',
      path: '/a/file.json',
      trailingSlash: false,
      queryAndHash: '#anchor',
    });

    t.end();
  });

  t.test('Http2Server', async t => {
    const openssl = '/usr/local/opt/openssl/bin/openssl';
    const path = fileURLToPath(new URL('../tls', import.meta.url));
    const { cert, key } = await refreshen({ openssl, path });

    t.ok(cert);
    t.ok(key);

    t.end();
  });

  t.end();
});
