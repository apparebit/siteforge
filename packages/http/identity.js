/* © 2020 Robert Grimm */

/**
 * Identify an HTTP/2 stream. To uniquely identify a resource without making
 * the result too verbose, this function includes the stream ID as well as the
 * remote endpoint.
 */
export const identifyHttp2Stream = stream =>
  `stream ${stream.id} of session with https://${identifyRemote(
    stream.session.socket
  )}`;

/** Identify the local end of a socket. */
export const identifyLocal = ({ localAddress, localFamily, localPort }) =>
  identifyEndpoint({
    address: localAddress,
    family: localFamily,
    port: localPort,
  });

/** Identify the remote end of a socket. */
export const identifyRemote = ({ remoteAddress, remoteFamily, remotePort }) =>
  identifyEndpoint({
    address: remoteAddress,
    family: remoteFamily,
    port: remotePort,
  });

/**
 * Identify an endpoint. This helper function provides its services directly to
 * server objects and indirectly through adapters.
 */
export const identifyEndpoint = ({ address, family, port }) =>
  family === 'IPv6' ? `[${address}]:${port}` : `${address}:${port}`;
