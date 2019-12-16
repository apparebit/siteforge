/* © 2019 Robert Grimm */

const BuiltinError = Error;
const configurable = true;
const { defineProperty } = Object;
const writable = true;

const BetterError = (message, cause) => {
  const error = new BuiltinError(message);
  if (cause !== undefined) {
    defineProperty(error, 'cause', {
      configurable,
      writable,
      value: cause,
    });
  }
  return error;
};

defineProperty(BetterError, 'name', {
  configurable,
  value: 'Error',
});

export default BetterError;
