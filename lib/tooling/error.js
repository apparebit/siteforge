/* © 2019 Robert Grimm */

const BuiltinError = Error;
const configurable = true;
const { defineProperty } = Object;
const writable = true;

export default function Error(message, cause) {
  const error = new BuiltinError(message);
  if (cause !== undefined) {
    defineProperty(error, 'cause', {
      configurable,
      writable,
      value: cause,
    });
  }
  return error;
}

defineProperty(Error, 'BuiltinError', {
  configurable,
  value: BuiltinError,
});
