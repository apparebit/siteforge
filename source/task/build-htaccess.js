/* © 2019 Robert Grimm */

import { createHash } from 'crypto';
import { join, resolve } from 'path';
import { readFile, toDirectory, writeFile } from '../tooling/fs.js';
import run from '../tooling/run.js';

const BUILD_HTACCESS = resolve(
  toDirectory(import.meta.url),
  '../../../server-configs-apache/bin/build.sh'
);

const INLINE_SCRIPT = /<script>([\s\S]*?)<\/script>/u;

function hashInlineScripts(html) {
  return [...html.matchAll(INLINE_SCRIPT)]
    .map(match => match[1])
    .map(s => {
      const hash = createHash('sha256')
        .update(s, 'utf8')
        .digest('base64');
      return `'sha256-${hash}'`;
    })
    .join(' ');
}

export default async function buildHTAccess() {
  // Build .htaccess.
  await run('bash', [BUILD_HTACCESS], { cwd: this.options.contentDir });

  // Hash inline scripts (at least for frontpage).
  const path = join(this.options.contentDir, 'index.html');
  const frontpage = await readFile(path, 'utf8');
  const hashes = hashInlineScripts(frontpage);

  // Inject into .htaccess.
  const htaccess = join(this.options.contentDir, '.htaccess');
  let config = await readFile(htaccess, 'utf8');
  config = config.replace(
    `script-src 'self' www.google-analytics.com;`,
    `script-src 'self' ${hashes} www.google-analytics.com;`
  );
  return writeFile(htaccess, config, 'utf8');
}
