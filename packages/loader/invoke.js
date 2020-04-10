/* © 2020 Robert Grimm */

import pickle from '@grr/oddjob/pickle';

const { has } = Reflect;
const MAGIC_PREFIX = '@grr/loader/invoke/';

async function invoke(command, data) {
  // Issue the request and await the response.
  let { default: response } = await import(
    `${MAGIC_PREFIX}${command}/${pickle(data)}`
  );

  // For error conditions, turn data back into an effect of executiomn.
  if (
    response == null ||
    typeof response !== 'object' ||
    (!has(response, 'value') && !has(response, 'error'))
  ) {
    // ----- Internal Error -----
    throw new SyntaxError(`malformed XPC response "${response}"!`);
  } else if (has(response, 'error')) {
    // ----- Command Error -----
    const error = new Error(response.error);
    if (response.stack) error.stack = response.stack;
    throw error;
  } else {
    // ----- Value -----
    return response.value;
  }
}

export default invoke;
