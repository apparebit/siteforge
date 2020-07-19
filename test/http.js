/* © 2020 Robert Grimm */

//import { strict as assert } from 'assert';

import {
  compareMediaTypes,
  matchMediaType,
  parseAcceptHeader,
  parseMediaRanges,
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
const TextHtml = { type: 'text', subtype: 'html' };
const Video = { type: 'video', subtype: '*' };
const VideoMp4 = { type: 'video', subtype: 'mp4' };
const VideoWebm = { type: 'video', subtype: 'webm' };

const TextPlainUtf8 = {
  type: 'text',
  subtype: 'plain',
  parameters: { charset: 'UTF-8' },
};
const TextPlainUtf8FixedFormat = {
  type: 'text',
  subtype: 'plain',
  parameters: { charset: 'UTF-8', format: 'fixed' },
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
      parseMediaType('text/plain; charset=; charset=uTF-8').mediaType,
      TextPlainUtf8
    );

    t.same(parseMediaType('text/plain; charset="UTF-8"').mediaType, {
      ...TextPlain,
      parameters: { charset: 'UTF-8' },
    });

    t.same(
      parseMediaType('text/PLAIN; charset="utf-8"; format=fixed').mediaType,
      { ...TextPlain, parameters: { charset: 'UTF-8', format: 'fixed' } }
    );

    t.same(
      parseMediaType('TEXT/plain; CHARSET="utf-8"; FORMAT=FIXED').mediaType,
      { ...TextPlain, parameters: { charset: 'UTF-8', format: 'FIXED' } }
    );

    // ------------------------------------------------------ parseMediaRanges()
    t.same(
      parseMediaRanges(
        'text/plain,/plain, text/plain; q=0.7, text/*, */*;q=0.1'
      ).mediaRanges,
      [TextPlain, { ...TextPlain, weight: 0.7 }, Text, { ...Any, weight: 0.1 }]
    );

    t.same(
      parseMediaRanges(
        'text/*, text/plain; q=0.7,/plain, */*;   q=0.1, text/plain'
      ).mediaRanges,
      [Text, { ...TextPlain, weight: 0.7 }, { ...Any, weight: 0.1 }, TextPlain]
    );

    // ----------------------------------------------------- compareMediaTypes()
    const cmt = compareMediaTypes;

    t.is(cmt(VideoMp4, { ...AudioMp4, weight: 0.5 }), -0.5);
    t.is(cmt({ ...Any, weight: 0.2 }, { ...Audio, weight: 0.4 }), 1);
    t.is(cmt({ ...Audio, weight: 0.4 }, { ...Any, weight: 0.2 }), -1);
    t.is(cmt({ ...Any, weight: 0.2 }, { ...AudioMp4, weight: 0.4 }), 2);
    t.is(cmt({ ...AudioMp4, weight: 0.4 }, { ...Any, weight: 0.2 }), -2);
    t.is(cmt({ ...Any, weight: 0.2 }, { ...TextPlainUtf8, weight: 0.4 }), 3);
    t.is(cmt({ ...TextPlainUtf8, weight: 0.4 }, { ...Any, weight: 0.2 }), -3);
    t.is(cmt({ ...TextPlain, weight: 0.2 }, { ...TextHtml, weight: 0.4 }), 0.2);
    t.is(
      cmt({ ...TextHtml, weight: 0.4 }, { ...TextPlain, weight: 0.2 }),
      -0.2
    );
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

    // ----------------------------------------------------- parseAcceptHeader()
    t.same(
      parseAcceptHeader(
        `*/*, ` +
          `text/plain, ` +
          `text/plain; charset=UTF-8; format=fixed, ` +
          `text/plain; charset=utf8, ` +
          `text/*`
      ),
      [TextPlainUtf8FixedFormat, TextPlainUtf8, TextPlain, Text, Any]
    );
    // `*/*; q=0.1, ` +
    //   `text/plain; q=0.5, ` +
    //   `text/plain; charset=UTF-8; format=fixed; q=0.8, ` +
    //   `text/plain; charset=utf8, ` +
    //   `text/*; q=0.2`
    //   )
    // );
    //   [
    //     TextPlainUtf8,
    //     { ...TextPlainUtf8FixedFormat, weight: 0.8 },
    //     { ...TextPlain, weight: 0.5 },
    //     { ...Any, weight: 0.2 },
    //   ]
    // );

    // ------------------------------------------------------- matchMediaTypes()
    t.ok(matchMediaType(TextPlain, Any));
    t.notOk(matchMediaType(TextPlain, Video));
    t.ok(matchMediaType(VideoMp4, Video));
    t.notOk(matchMediaType(TextPlain, VideoMp4));
    t.ok(matchMediaType(VideoMp4, VideoMp4));
    t.ok(matchMediaType({ type: 'video', subtype: 'mp4' }, VideoMp4));
    t.ok(matchMediaType(VideoMp4, { type: 'video', subtype: 'mp4' }));
    t.ok(matchMediaType(TextPlain, TextPlain));
    t.ok(matchMediaType(TextPlain, TextPlainUtf8));
    t.ok(matchMediaType(TextPlainUtf8, TextPlainUtf8));
    t.ok(
      matchMediaType(
        parseMediaType('text/plain;CHARSET=utf8').mediaType,
        TextPlainUtf8
      )
    );
    t.ok(
      matchMediaType(
        parseMediaType('text/plain;CHARSET="utf8"').mediaType,
        TextPlainUtf8
      )
    );
    t.ok(
      matchMediaType(
        { ...TextPlain, parameters: { charset: 'UTF-8' } },
        TextPlainUtf8
      )
    );
    t.notOk(
      matchMediaType(
        { ...TextPlain, parameters: { charset: 'US-ASCII' } },
        TextPlainUtf8
      )
    );
    t.ok(matchMediaType(TextPlainUtf8, TextPlain));
    t.ok(matchMediaType(TextPlainUtf8, Text));
    t.notOk(matchMediaType(VideoMp4, TextPlainUtf8));
    t.notOk(matchMediaType(VideoMp4, TextPlain));
    t.notOk(matchMediaType(VideoMp4, Text));
    t.ok(matchMediaType(VideoMp4, Any));

    t.end();
  });

  t.end();
});
