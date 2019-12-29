/* © 2019 Robert Grimm */

const ANY_SEGMENT_CHAR = '[^/]';
const ANY_SEGMENT_PART = '[^/]*?';
const ANY_SEGMENTS = '(|.+?/)'; // Either no segment or a non-empty segment!
const ANYTHING = '.*?';
const QUESTION_MARK = '?'.charCodeAt(0);
const STAR = '*'.charCodeAt(0);

const regexFor = segment =>
  segment
    // Escape all special characters but star and question mark.
    .replace(/[.+^${}()|[\]]/gu, '\\$&')
    // Translate star and question mark.
    .replace(/(?<!\\)[*?]/gu, c => {
      switch (c.charCodeAt(0)) {
        case STAR:
          return ANY_SEGMENT_PART;
        case QUESTION_MARK:
          return ANY_SEGMENT_CHAR;
        default:
          throw new Error('Unreachable statement');
      }
    });

/**
 * Convert the given glob patterns into the corresponding predicate on file and
 * directory names. Each glob consists of any number of paths separated by
 * vertical bars `|`. Path segments may contain a question mark `?` to match any
 * single character and a star `*` to match any number of characters including
 * none. They may also consist of two stars `**` to match any number of path
 * segments including none. If a path has only one segment, this function treats
 * the path as if it had `**\/` prefixed.
 */
export default function glob(...globs) {
  const pattern = globs
    .flatMap(g => g.split('|'))
    .flatMap(glob => {
      if (!glob) {
        return [];
      } else if (glob.endsWith('/')) {
        glob = glob.slice(0, glob.length - 1);
      }

      const segments = glob.split(/(?<!\\)[/]/u);
      const regexFragments = [];

      // If there is only one segment, treat it as if prefixed with '**/'.
      if (segments.length === 1 && segments[0] !== '**') {
        regexFragments.push(ANY_SEGMENTS);
      }

      for (const [index, segment] of segments.entries()) {
        const hasNext = index < segments.length - 1;

        if (segment.includes('**')) {
          if (segment.length !== 2) {
            throw new SyntaxError(
              `Glob "${glob}" contains invalid segment wildcard`
            );
          } else if (segments[index + 1] === '**') {
            continue; // One segment wildcard suffices!
          } else if (hasNext) {
            regexFragments.push(ANY_SEGMENTS);
          } else {
            regexFragments.push(ANYTHING);
          }
        } else {
          regexFragments.push(regexFor(segment));
          if (
            hasNext &&
            segments[index + 1] === '**' &&
            index === segments.length - 2
          ) {
            regexFragments.push(ANYTHING);
          } else if (hasNext) {
            regexFragments.push('/');
          } else {
            regexFragments.push('/?');
          }
        }
      }

      return [regexFragments.join('')];
    })
    .join('|');

  if (!pattern) return () => false;
  const regex = new RegExp(`^(${pattern})$`, 'u');
  return path => regex.test(path);
}
