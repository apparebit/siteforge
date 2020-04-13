/* © 2020 Robert Grimm */

import pickle from '@grr/oddjob/pickle';

const { has } = Reflect;
const MAGIC_PREFIX = '@grr/loader/invoke/';

/**  Convert given response from data record to execution effect. */
export function returnOrThrow(response) {
  if (
    response == null ||
    typeof response !== 'object' ||
    (!has(response, 'value') && !has(response, 'error'))
  ) {
    throw new SyntaxError(`Malformed XPC response "${response}"!`);
  } else if (has(response, 'error')) {
    const error = new Error(response.error);
    if (response.stack) error.stack = response.stack;
    throw error;
  } else {
    return response.value;
  }
}

/** Invoke the given command on the given data within the module loader. */
export default async function invoke(command, data) {
  let { default: response } = await import(
    `${MAGIC_PREFIX}${command}/${pickle(data)}`
  );
  return returnOrThrow(response);
}
