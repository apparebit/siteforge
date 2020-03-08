/* © 2019 Robert Grimm */

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
          return '[^/]*?';
        case QUESTION_MARK:
          return '[^/]';
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

      if (segments.length === 1 && segments[0] === '**') {
        return '.*?';
      } else if (segments.length === 1 || segments[0] === '**') {
        // One segment or an explicit segment wildcard accepts segments followed
        // by slash, just a slash, or nothing.
        regexFragments.push('(.+?[/]|[/]|)');
      }

      for (const [index, segment] of segments.entries()) {
        const hasNext = index < segments.length - 1;

        if (segment.includes('**')) {
          if (segment.length !== 2) {
            throw new SyntaxError(
              `Glob "${glob}" contains invalid segment wildcard`
            );
          } else if (
            index === 0 ||
            (index > 0 && segments[index - 1] === '**')
          ) {
            // We processed starting segment wildcard above. Do not process
            // repeated segment wildcards.
            continue;
          } else if (hasNext) {
            regexFragments.push('(|.+?/)');
          } else {
            regexFragments.push('.*?');
          }
        } else {
          regexFragments.push(regexFor(segment));
          if (
            hasNext &&
            segments[index + 1] === '**' &&
            index === segments.length - 2
          ) {
            // Nothing to do.
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
  const regex = new RegExp(`^(${pattern})$`, 'iu');
  return path => regex.test(path);
}
