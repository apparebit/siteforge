/* © 2020 Robert Grimm */

import Call from './call.js';
import { fileURLToPath } from 'url';

const DEBUG = false;
const DUMMY_MODULE = new URL('./dummy.js', import.meta.url).href;

export const fileURL = import.meta.url;
export const filePath = fileURLToPath(fileURL);

const call = new Call({
  ping(data) {
    return { pong: data };
  },
  fail(reason) {
    throw new Error(reason);
  },
});

/** Resolve the module specifier to a valid URL. */
export function resolve(specifier, context, builtinResolve) {
  /* c8 ignore next 4 */
  if (DEBUG) {
    const { parentURL } = context;
    console.error(
      `resolve("${specifier}"${parentURL ? `, "${parentURL}"` : ``})`
    );
  }

  if (Call.Request.is(specifier)) {
    return call.handleRequest(specifier);
  }

  return builtinResolve(specifier, context, builtinResolve);
}

/** Transform the source code already loaded. */
export function transformSource(source, context, defaultTransformSource) {
  const { url } = context;

  if (url === DUMMY_MODULE) {
    return { source: `export default '@grr/loader';` };
  } else if (Call.Response.is(url)) {
    return call.handleResponse(url);
  }

  return defaultTransformSource(source, context, defaultTransformSource);
}
