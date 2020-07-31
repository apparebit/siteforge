/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import run from '@grr/run';

/**
 * Create a new self-signed certificate. The certificate is restricted for use
 * as a server certificate for `localhost` for 30 days. Both certificate and
 * private key are stored in the directory with the given path.
 */
export const certifyLocalhost = path => {
  // prettier-ignore
  const options = [
    'req', '-x509',
    '-newkey', 'rsa',
    '-nodes',
    '-keyout', 'localhost.key',
    '-subj', '/CN=localhost',
    '-days', '30', // It's the default but let's be explicit.
    '-config', fileURLToPath(new URL('localhost.cfg', import.meta.url)),
    '-out', 'localhost.crt',
  ];

  return run('openssl', options, { cwd: path });
};

/** Read the dates from the certificate in the file with the given path. */
export const readCertDates = async path => {
  // prettier-ignore
  const options = [
    'x509',
    '-in', path,
    '-noout',
    '-dates'
  ];

  const { stdout } = await run('openssl', options);
  const lines = stdout.split(/\r?\n/u);

  let [label, date] = lines[0].split('=');
  assert(label === 'notBefore');
  const notBefore = new Date(date);

  [label, date] = lines[1].split('=');
  assert(label === 'notAfter');
  const notAfter = new Date(date);

  return { notBefore, notAfter };
};
