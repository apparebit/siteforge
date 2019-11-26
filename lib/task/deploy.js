/**
 * @module task/deploy
 * @copyright (C) 2019 Robert Grimm
 */

import { options } from '../config.js';
import run from '../tooling/run.js';

// rsync <options> source target
//     NB Source path must end with slash to sync contents, not directory.
//
// -c, --checksum           use checksum not file size + modification time
// -e, --rsh=COMMAND        remote shell
// -n, --dry-run            dry run
// -r, --recursive          recursively
// -u, --update             skip destination files with newer timestamp
// -v, --verbose            verbose
//     --exclude=PATTERN    exclude from source
//     --delete             delete from destination

export default function deploy() {
  // prettier-ignore
  const rsyncOptions = [
    '-cruv',
    '-e', 'ssh -p 2222',
    '--exclude', 'cgi-bin',
    '--exclude', '.well-known',
    '--exclude', '.DS_Store',
    '--exclude', '.git',
    '--delete',
  ];

  if (options['dry-run']) rsyncOptions.push('--dry-run');

  return run('rsync', [
    ...rsyncOptions,
    options.buildDir,
    options.deploymentDir,
  ]);
}
