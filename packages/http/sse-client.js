/* © 2020 Robert Grimm */

import { Header, MethodName } from './constants.js';
import MediaType from './media-type.js';
import readline from 'readline';
import { STATUS_CODES } from 'http';

const { ContentType, Status } = Header;
const { GET } = MethodName;

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
    ':method': GET,
    ':path': path,
    accept: MediaType.EventStream,
  });

  const linesOfBody = new Promise((resolve, reject) => {
    stream.on('response', headers => {
      const status = headers[Status];
      const type = MediaType.from(headers[ContentType]);

      if (status !== 200) {
        reject(Not200(status));
      } else if (!isEventStream(type)) {
        reject(NotEventStream(type));
      } else {
        stream.setEncoding('utf8');
        resolve(readline.createInterface({ input: stream }));
      }
    });
  });

  try {
    let event;
    for await (const line of await linesOfBody) {
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
