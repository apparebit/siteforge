/* © 2019 Robert Grimm */

import { extname } from 'path';
import run from '../tooling/run.js';
import vnuPath from 'vnu-jar';
import Walk from '../tooling/walk.js';

const TO_BE_IGNORED = [
  `CSS: “backdrop-filter”: Property “backdrop-filter” doesn't exist.`,
  `CSS: “background-image”: “0%” is not a “color” value.`,
  `CSS: “color-adjust”: Property “color-adjust” doesn't exist.`,
  `File was not checked. Files must have .html, .xhtml, .htm, or .xht extensions.`,
  `The “contentinfo” role is unnecessary for element “footer”.`,
];

export default async function validateMarkup() {
  // <rant>The fact that Nu Validator appears to be the only serious HTML5
  // validator probably also is the only reason that people are using it. Its
  // command line interface is outright hostile to humans, exposing a good
  // number of boolean flags for selecting files instead of a far more general
  // file name pattern facility. Hence, we talk the directory tree before Nu
  // Validator walks the same tree just to determine whether a file should be
  // or shouldn't be validated. Really?</rant>
  const files = [];
  for await (const { path } of Walk.walk(this.options.buildDir)) {
    const extension = extname(path);
    if (
      (extension === '.htm' || extension === '.html') &&
      !this.options.doNotValidate(path)
    ) {
      files.push(path);
    }
  }

  // prettier-ignore
  return run('java', [
    '-jar', vnuPath,
    '--skip-non-html',
    '--filterpattern', TO_BE_IGNORED.join('|'),
    ...(this.options.volume >= 2 ? ['--verbose'] : []),
    ...files,
  ]);
}
