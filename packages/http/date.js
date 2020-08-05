/* © 2020 Robert Grimm */

const DATE_FORMAT = new RegExp(
  `^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([0-3]\\d) ` +
    `(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ` +
    `(2\\d[2-9]\\d) ([0-2]\\d):([0-6]\\d):([0-6]\\d) GMT$`,
  'u'
);

const MONTH_INDEX = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

export default function parseDate(value) {
  if (!value) return undefined;

  const components = value.match(DATE_FORMAT);
  if (components == null) return undefined;

  const [, , day, month, year, hours, minutes, seconds] = components;
  return new Date(year, MONTH_INDEX[month], day, hours, minutes, seconds);
}
