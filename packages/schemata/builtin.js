/* © 2020 Robert Grimm */

const { freeze } = Object;

const Builtin = freeze({
  Array,
  BigInt,
  Boolean,
  Date,
  Error,
  Function,
  JSON,
  Map,
  Number,
  Object,
  Promise,
  Proxy,
  Reflect,
  RegExp,
  Set,
  String,
  Symbol,
});

export default Builtin;
