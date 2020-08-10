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
  const handleServerEvents = (exchange, next) => {
    if (exchange.method !== 'GET') {
      return exchange.fail(HTTP_STATUS_METHOD_NOT_ALLOWED);
    } else if (exchange.quality(MediaType.EventStream) === 0) {
      return exchange.fail(HTTP_STATUS_NOT_ACCEPTABLE);
    }

    // Set up event stream.
    exchange.stream.respond({
      [HTTP2_HEADER_STATUS]: HTTP_STATUS_OK,
      [HTTP2_HEADER_CACHE_CONTROL]: 'no-cache, no-transform',
      [HTTP2_HEADER_CONTENT_TYPE]: MediaType.EventStream,
    });

    const cleanup = () => {
      if (ongoing) ongoing.delete(exchange);
    };
    exchange.didRespond().then(cleanup);
    ongoing.add(exchange);

    exchange.stream.setEncoding('utf8');
    if (reconnect > 0) {
      exchange.stream.write(`retry: ${reconnect}\n\n`);
    } else {
      exchange.stream.write(`:start\n\n`);
    }
    return exchange.didRespond();
  };

  const each = fn => {
    for (const exchange of ongoing) {
      if (exchange.isDone()) {
        ongoing.delete(exchange);
      } else {
        fn(exchange);
      }
    }
  };

  const ping = () => {
    if (ongoing) {
      each(exchange => exchange.stream.write(`:lub-DUB\n\n`));
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

      each(exchange => exchange.stream.write(message));
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
      each(exchange => {
        exchange.stream.end();
        ongoing.delete(exchange);
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
