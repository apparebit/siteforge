/* © 2020 Robert Grimm */

const { has: MapHas } = Map.prototype;
const { has: SetHas } = Set.prototype;

export function isMap(value) {
  try {
    MapHas.call(value);
    return true;
  } catch {
    return false;
  }
}

export function isSet(value) {
  try {
    SetHas.call(value);
    return true;
  } catch {
    return false;
  }
}
