/* © 2021 Robert Grimm */

import MediaType from './media-type.js';
import * as Middleware from './middleware.js';
import { readySelfSigned } from './certificate.js';
import Server from './server.js';

// This Dev Server client only ever reloads the current page in reaction to file
// system change events for the website's sources. While rather simplistic, this
// does ensure that displayed content is always up-to-date — at the coast of
// unnecessary and unnecessarily large reload operations. The client is more
// sophisticated in how it handles the EventSource instance since these objects
// automatically reconnect to the server upon errors. In particular, the client
// implements support for the `close` event to help with graceful server
// shutdown. It also tracks successive `error` events to terminate itself when
// such an error trace becomes too long.

const handler = (origin, debug = false) => `
let DEBUG = ${Boolean(debug)};
let source = new EventSource("${origin}/@@event");
let errorCount = 0;

source.addEventListener("open", () => {
  if (DEBUG) console.log("@@event: open");
  errorCount = 0;
});

source.addEventListener("reload", evt => {
  let data = evt.data;
  try {
    data = JSON.parse(data);
  } catch (x) {
    // Nothing to do.
  }

  if (DEBUG) console.log("@@event: reload", data);
  location.reload();
  errorCount = 0;
});

source.addEventListener("close", () => {
  if (DEBUG) console.log("@@event: close");
  source.close();
  errorCount = 0;
});

source.addEventListener("error", evt => {
  if (DEBUG) console.error("@@event: error", evt);
  errorCount++;
  if (errorCount >= 5) source.close();
});
`;

const createDevServer = async config => {
  const { logger, options } = config;

  const tlsConfig = { path: options.tlsCertificate };
  if (config.ip) {
    tlsConfig.ip = [config.ip];
  }
  const keycert = await readySelfSigned(tlsConfig);

  const server = new Server({
    ip: config.ip ?? '127.0.0.1',
    port: 8080,
    logger,
    ...keycert,
  });

  const eventSource = Middleware.eventSource({ logger });
  const clientHandler = handler(server.origin, options.volume >= 1);

  server
    .route(Middleware.scaffold())
    .route(Middleware.redirectOnTrailingSlash())
    .route(Middleware.allowGetAndHeadOnly())
    .route(Middleware.doNotCache())
    .route(
      Middleware.transformMatchingBodyText(
        MediaType.HTML,
        Middleware.createAppendToBody(
          `<script type="module" src="${server.origin}/@@handler"></script>`
        )
      )
    )
    .route('/@@event', eventSource)
    .route(
      '/@@handler',
      Middleware.content({
        type: MediaType.JavaScript,
        body: clientHandler,
      })
    )
    .route(Middleware.satisfyFromFileSystem({ root: options.buildDir }));

  try {
    await server.listen();
  } catch (x) {
    // If server fails to start up, we must close eventSource to stop timer.
    eventSource.close();
    throw x;
  }
  return { eventSource, server };
};

export default createDevServer;
