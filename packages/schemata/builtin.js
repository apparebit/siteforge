/* © 2020 Robert Grimm */

const { freeze } = Object;

const Builtin = freeze({
  Array,
  Map,
  Number,
  Object,
  Set,
  String,
});

export default Builtin;
