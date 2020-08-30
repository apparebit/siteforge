/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { constants } from 'http2';
import MediaType from './media-type.js';

const {
  HTTP_STATUS_METHOD_NOT_ALLOWED,
  HTTP_STATUS_NOT_ACCEPTABLE,
  HTTP_STATUS_OK,
  HTTP2_HEADER_CACHE_CONTROL,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_STATUS,
} = constants;

const configurable = true;
const { defineProperties } = Object;
const { isSafeInteger } = Number;

const createServerEventHandler = ({
  heartbeat = 10 * 60 * 1000,
  reconnect = 500,
  startTimer = setInterval,
  stopTimer = clearInterval,
} = {}) => {
  assert(isSafeInteger(heartbeat) && heartbeat >= 0);
  assert(isSafeInteger(reconnect) && reconnect >= 0);
  assert(typeof startTimer === 'function');
  assert(typeof stopTimer === 'function');

  let ongoing = new Set();

  // eslint-disable-next-line no-unused-vars
  const handleServerEvents = (context, next) => {
    if (context.method !== 'GET') {
      return context.fail(HTTP_STATUS_METHOD_NOT_ALLOWED);
    } else if (context.quality(MediaType.EventStream) === 0) {
      return context.fail(HTTP_STATUS_NOT_ACCEPTABLE);
    }

    // Set up event stream.
    context.stream.respond({
      [HTTP2_HEADER_STATUS]: HTTP_STATUS_OK,
      [HTTP2_HEADER_CACHE_CONTROL]: 'no-cache, no-transform',
      [HTTP2_HEADER_CONTENT_TYPE]: MediaType.EventStream,
    });

    const cleanup = () => {
      if (ongoing) ongoing.delete(context);
    };
    context.didRespond().then(cleanup);
    ongoing.add(context);

    context.stream.setEncoding('utf8');
    if (reconnect > 0) {
      context.stream.write(`retry: ${reconnect}\n\n`);
    } else {
      context.stream.write(`:start\n\n`);
    }
    return context.didRespond();
  };

  const each = fn => {
    for (const context of ongoing) {
      if (context.isDone()) {
        ongoing.delete(context);
      } else {
        fn(context);
      }
    }
  };

  const ping = () => {
    if (ongoing) {
      each(context => context.stream.write(`:lub-DUB\n\n`));
    }
  };

  const emit = ({ id, event, data }) => {
    if (ongoing) {
      let message = '';
      if (id) message += `id: ${id}\n`;
      if (event) message += `event: ${event}\n`;
      if (data) message += `data: ${data}\n`;
      if (!message) return;
      message += `\n`;

      each(context => context.stream.write(message));
    }
  };

  let timer = heartbeat > 0 ? startTimer(() => ping(), heartbeat) : null;

  const close = () => {
    if (ongoing) {
      // Stop heartbeat.
      if (timer) {
        stopTimer(timer);
        timer = null;
      }

      // Stop streams.
      each(context => {
        context.stream.end();
        ongoing.delete(context);
      });
      ongoing = null;
    }
  };

  defineProperties(handleServerEvents, {
    emit: { configurable, value: emit },
    close: { configurable, value: close },
  });
  return handleServerEvents;
};

export default createServerEventHandler;
