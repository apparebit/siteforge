/* © 2020 Robert Grimm */

// Shared features, from constants to low-level utilities to media types.
export {
  Header,
  MethodName,
  StatusCode,
  StatusWithoutBody,
} from './constants.js';

export {
  // ---------- Making endpoints human-readable.
  identifyEndpoint,
  // ---------- Wrangling paths.
  hasExtension,
  isMountedAt,
  slash,
  unslash,
  validateRequestPath,
  validateRoutePath,
  // ---------- Parsing dates.
  parseDateHTTP,
  parseDateOpenSSL,
  // ---------- Escaping HTML body text.
  escapeText,
} from './util.js';

export {
  createSelfSigned,
  dumpCertificate,
  parseValidity,
  readySelfSigned,
} from './certificate.js';

export { default as MediaType } from './media-type.js';

// Client.
export { default as Client } from './client.js';

// Server including middleware.
export { default as Server } from './server.js';
export { default as Context } from './context.js';
