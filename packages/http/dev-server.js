/* © 2021 Robert Grimm */

import MediaType from './media-type.js';
import * as Middleware from './middleware.js';
import { readySelfSigned } from './certificate.js';
import Server from './server.js';

const createDevServer = async config => {
  const { logger, options } = config;
  const keycert = await readySelfSigned({ path: options.tlsCertificate });
  const server = Server.create({
    ip: '127.0.0.1',
    port: 8080,
    logger,
    ...keycert,
  });

  const eventSource = Middleware.eventSource();

  server
    .route(Middleware.scaffold())
    .route(Middleware.redirectOnTrailingSlash())
    .route(Middleware.allowGetAndHeadOnly())
    .route(
      Middleware.transformMatchingBodyText(
        MediaType.HTML,
        Middleware.createAppendToBody(
          `<script src="${server.origin}/@@@handler"></script>`
        )
      )
    )
    .route('@@@events', eventSource)
    .route(
      '@@@handler',
      Middleware.content({
        type: MediaType.JavaScript,
        body: `
          let source = new EventSource("${server.origin}/@@@events");
          source.onmessage = () => location.reload();
          source.onerror = console.error;
      `,
      })
    )
    .route(Middleware.satisfyFromFileSystem({ root: options.buildDir }));

  await server.listen();

  return { eventSource, server };
};

export default createDevServer;
