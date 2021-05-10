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

const handler = origin => `
let source = new EventSource("${origin}/@@event");
let errorCount = 0;

source.addEventListener("open", () => {
  console.log("@@event: open");
  errorCount = 0;
});

source.addEventListener("reload", evt => {
  let data = evt.data;
  try {
    data = JSON.parse(data);
  } catch (x) {
    // Nothing to do.
  }

  console.log("@@event: reload", data);
  location.reload();
  errorCount = 0;
});

source.addEventListener("close", () => {
  console.log("@@event: close");
  source.close();
  errorCount = 0;
});

source.addEventListener("error", evt => {
  console.error("@@event: error", evt);
  errorCount++;
  if (errorCount >= 5) source.close();
});
`;

const createDevServer = async config => {
  const { logger, options } = config;
  const keycert = await readySelfSigned({ path: options.tlsCertificate });
  const server = new Server({
    ip: '127.0.0.1',
    port: 8080,
    logger,
    ...keycert,
  });
  const eventSource = Middleware.eventSource({ logger });

  server
    .route(Middleware.scaffold())
    .route(Middleware.redirectOnTrailingSlash())
    .route(Middleware.allowGetAndHeadOnly())
    .route(Middleware.doNotCache())
    .route(
      Middleware.transformMatchingBodyText(
        MediaType.HTML,
        Middleware.createAppendToBody(
          `<script src="${server.origin}/@@handler"></script>`
        )
      )
    )
    .route('/@@event', eventSource)
    .route(
      '/@@handler',
      Middleware.content({
        type: MediaType.JavaScript,
        body: handler(server.origin),
      })
    )
    .route(Middleware.satisfyFromFileSystem({ root: options.buildDir }));

  await server.listen();
  return { eventSource, server };
};

export default createDevServer;
