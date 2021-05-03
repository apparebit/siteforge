/* © 2021 Robert Grimm */

export const debounce = (thunk, delay) => {
  let timeout, timestamp;

  const later = () => {
    let quietPeriod = Date.now() - timestamp;
    if (quietPeriod < delay) {
      timeout = setTimeout(later, delay - quietPeriod);
    } else {
      timeout = null;
      thunk();
    }
  };

  return () => {
    timestamp = Date.now();
    if (!timeout) {
      timeout = setTimeout(later, delay);
    }
  };
};
