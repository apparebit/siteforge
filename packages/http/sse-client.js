/* © 2020 Robert Grimm */

import { constants } from 'http2';
import MediaType from './media-type.js';
import readline from 'readline';
import { settleable } from '@grr/async/promise';
import { STATUS_CODES } from 'http';

const { HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_STATUS } = constants;

const Not200 = status => {
  let code = STATUS_CODES[status];
  code = code ? ` (${code})` : ``;
  return new Error(
    `Status code is "${status}"${code} instead of expected "200"`
  );
};

const isEventStream = type =>
  type != null && type.type === 'text' && type.subtype === 'event-stream';
const NotEventStream = type =>
  new Error(
    `Content type is "${type}" instead of expected "text/event-stream"`
  );

export default async function* events(session, path) {
  const stream = session.request({
    ':method': 'GET',
    ':path': path,
    accept: 'text/event-stream',
  });

  const { promise, resolve, reject } = settleable();

  stream.on('response', headers => {
    const status = headers[HTTP2_HEADER_STATUS];
    const type = MediaType.from(headers[HTTP2_HEADER_CONTENT_TYPE]);

    if (status !== 200) {
      reject(Not200(status));
    } else if (!isEventStream(type)) {
      reject(NotEventStream(type));
    } else {
      stream.setEncoding('utf8');
      resolve(readline.createInterface({ input: stream }));
    }
  });

  try {
    let event;
    for await (const line of await promise) {
      if (line === '') {
        // Empty line completes event.
        yield event;
        event = undefined;
      } else {
        // Initialize only when needed.
        if (event == null) event = {};

        // Capture only if not a comment.
        const [key, value] = line.split(':', 2);
        if (key !== '') event[key] = value.trimStart();
      }
    }

    if (event) yield event;
  } finally {
    stream.close();
  }
}
