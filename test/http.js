/* © 2020 Robert Grimm */

//import { strict as assert } from 'assert';

import {
  compareMediaTypes,
  matchMediaTypes,
  parseAcceptHeader,
  parseMediaRange,
  parseMediaType,
  parseQuotedString,
} from '@grr/http/media-type';

import harness from './harness.js';

// Some structured media types to help with assertions.
const Any = { type: '*', subtype: '*' };
const Audio = { type: 'audio', subtype: '*' };
const AudioMp4 = { type: 'audio', subtype: 'mp4' };
const Image = { type: 'image', subtype: '*' };
const ImagePng = { type: 'image', subtype: 'png' };
const ImageSvg = { type: 'image', subtype: 'svg+xml' };
const Text = { type: 'text', subtype: '*' };
const TextPlain = { type: 'text', subtype: 'plain' };
const Video = { type: 'video', subtype: '*' };
const VideoMp4 = { type: 'video', subtype: 'mp4' };
const VideoWebm = { type: 'video', subtype: 'webm' };

const TextPlainUtf8 = {
  type: 'text',
  subtype: 'plain',
  parameters: { charset: 'utf-8' },
};
const TextPlainUtf8FixedFormat = {
  type: 'text',
  subtype: 'plain',
  parameters: { charset: 'utf-8', format: 'fixed' },
};

harness.test('@grr/http', t => {
  t.test('media-type', t => {
    // ----------------------------------------------------- parseQuotedString()
    t.throws(() => parseQuotedString('#boo#'));
    t.is(parseQuotedString(`""`).value, ``);
    t.is(parseQuotedString(`"boo"`).value, `boo`);
    t.is(parseQuotedString(`"\\"\\\\\\""`).value, `"\\"`);
    t.is(
      parseQuotedString(`"text\\"text\\\\text\\"text"`).value,
      `text"text\\text"text`
    );
    t.is(parseQuotedString(`"text`).value, `text`);
    t.is(parseQuotedString(`"text\\`).value, `text\\`);

    // -------------------------------------------------------- parseMediaType()
    t.is(parseMediaType(``).mediaType, undefined);
    t.is(parseMediaType(`boo`).mediaType, undefined);
    t.is(parseMediaType(`boo/`).mediaType, undefined);
    t.is(parseMediaType(`/boo`).mediaType, undefined);
    t.is(parseMediaType(`boo/`).mediaType, undefined);
    t.is(parseMediaType(`b(o)o/boo`).mediaType, undefined);
    t.is(parseMediaType(`boo/b(o)o`).mediaType, undefined);

    t.same(parseMediaType('text/plain').mediaType, TextPlain);
    t.same(parseMediaType('text/plain   ').mediaType, TextPlain);
    t.same(parseMediaType('text/plain ; charset').mediaType, TextPlain);

    t.same(
      parseMediaType('text/plain; charset; charset=utf-8').mediaType,
      TextPlainUtf8
    );

    t.same(
      parseMediaType('text/plain; charset=; charset=utf-8').mediaType,
      TextPlainUtf8
    );

    t.same(parseMediaType('text/plain; charset="UTF-8"').mediaType, {
      ...TextPlain,
      parameters: { charset: 'UTF-8' },
    });

    t.same(
      parseMediaType('text/PLAIN; charset="utf-8"; format=fixed').mediaType,
      { ...TextPlain, parameters: { charset: 'utf-8', format: 'fixed' } }
    );

    t.same(
      parseMediaType('TEXT/plain; CHARSET="utf-8"; FORMAT=FIXED').mediaType,
      { ...TextPlain, parameters: { charset: 'utf-8', format: 'FIXED' } }
    );

    // ------------------------------------------------------- parseMediaRange()
    t.same(
      parseMediaRange('text/plain,/plain, text/plain; q=0.7, text/*, */*;q=0.1')
        .mediaRange,
      [TextPlain, { ...TextPlain, weight: 0.7 }, Text, { ...Any, weight: 0.1 }]
    );

    t.same(
      parseMediaRange(
        'text/*, text/plain; q=0.7,/plain, */*;   q=0.1, text/plain'
      ).mediaRange,
      [Text, { ...TextPlain, weight: 0.7 }, { ...Any, weight: 0.1 }, TextPlain]
    );

    // ----------------------------------------------------- compareMediaTypes()
    const cmt = compareMediaTypes;

    t.is(cmt(VideoMp4, { ...AudioMp4, weight: 0.5 }), -0.5);
    t.is(cmt({ ...Any, weight: 0.2 }, { ...Audio, weight: 0.4 }), 0.2);
    t.is(cmt({ ...Audio, weight: 0.4 }, { ...Any, weight: 0.2 }), -0.2);
    t.is(cmt(AudioMp4, VideoMp4), -1);
    t.is(cmt(VideoMp4, AudioMp4), 1);
    t.is(cmt(Any, Video), 1);
    t.is(cmt(Video, VideoMp4), 1);
    t.is(cmt(VideoMp4, Video), -1);
    t.is(cmt(Video, Any), -1);
    t.is(cmt(VideoMp4, VideoWebm), -1);
    t.is(cmt(VideoWebm, VideoMp4), 1);
    t.is(cmt(ImagePng, ImageSvg), -1);
    t.is(cmt(ImageSvg, ImagePng), 1);
    t.is(cmt(Image, Image), 0);
    t.is(cmt(TextPlainUtf8, TextPlainUtf8), 0);
    t.is(cmt(TextPlainUtf8FixedFormat, TextPlain), -2);
    t.is(cmt(TextPlainUtf8FixedFormat, TextPlainUtf8), -1);
    t.is(cmt(TextPlain, TextPlainUtf8), 1);
    t.is(cmt(TextPlain, TextPlainUtf8FixedFormat), 2);

    // ----------------------------------------------------- parseAcceptHeader()
    t.same(
      parseAcceptHeader(
        `*/*; q=0.2, text/plain; q=0.5, ` +
          `text/plain; charset=utf-8; format=fixed, text/plain; charset=utf-8`
      ),
      [
        { ...TextPlainUtf8FixedFormat, position: 2 },
        { ...TextPlainUtf8, position: 3 },
        { ...TextPlain, weight: 0.5, position: 1 },
        { ...Any, weight: 0.2, position: 0 },
      ]
    );

    // ------------------------------------------------------- matchMediaTypes()
    t.ok(matchMediaTypes({ type: '*', subtype: '*' }, TextPlain));
    t.ok(matchMediaTypes({ type: 'text', subtype: '*' }, TextPlain));
    t.ok(matchMediaTypes({ type: 'text', subtype: 'plain' }, TextPlain));
    t.ok(matchMediaTypes({ type: 'text', subtype: '*' }, Text));
    t.ok(matchMediaTypes(TextPlain, { type: '*', subtype: '*' }));
    t.ok(matchMediaTypes(TextPlain, { type: 'text', subtype: '*' }));
    t.ok(matchMediaTypes(TextPlain, { type: 'text', subtype: 'plain' }));
    t.ok(matchMediaTypes(Text, { type: 'text', subtype: '*' }));
    t.ok(matchMediaTypes(Any, Any));
    t.ok(matchMediaTypes(TextPlain, TextPlainUtf8FixedFormat));
    t.ok(matchMediaTypes(TextPlainUtf8FixedFormat, TextPlain));
    t.notOk(matchMediaTypes(Video, Audio));
    t.notOk(matchMediaTypes(Video, TextPlain));
    t.notOk(matchMediaTypes(VideoMp4, TextPlain));
    t.notOk(matchMediaTypes(VideoWebm, TextPlain));
    t.notOk(matchMediaTypes(Audio, Video));
    t.notOk(matchMediaTypes(TextPlain, Video));
    t.notOk(matchMediaTypes(TextPlain, VideoMp4));
    t.notOk(matchMediaTypes(TextPlain, VideoWebm));

    t.end();
  });

  t.end();
});
