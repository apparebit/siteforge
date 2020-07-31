/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { promises } from 'fs';
import run from '@grr/run';
import { settleable } from '@grr/async/promise';

const LOCALHOST_CFG = 'localhost.cfg';
const LOCALHOST_CRT = 'localhost.crt';
const LOCALHOST_KEY = 'localhost.key';

const { readFile } = promises;

// -----------------------------------------------------------------------------

/**
 * Create a new self-signed certificate. The certificate is restricted for use
 * as a server certificate for `localhost` for 30 days. Both certificate and
 * private key are stored in the directory with the given path. This function
 * expects that OpenSSL is installed and on the path.
 */
export const certifyLocalhost = ({ openssl = 'openssl', path }) => {
  // prettier-ignore
  const args = [
    'req', '-x509',
    '-newkey', 'rsa',
    '-nodes',
    '-keyout', LOCALHOST_KEY,
    '-subj', '/CN=localhost',
    '-days', '30', // It's the default but let's be explicit.
    '-config', fileURLToPath(new URL(LOCALHOST_CFG, import.meta.url)),
    '-out', LOCALHOST_CRT,
  ];

  return run(openssl, args, { cwd: path });
};

// -----------------------------------------------------------------------------

/**
 * Read the not-before and not-after dates from a certificate. If `path` is
 * defined, the certificate is stored in a file with that path. If `cert` is
 * defined instead, the certificate is passed by value. This function expects
 * that OpenSSL is installed and on the path.
 */
export const readCertDates = async ({ openssl = 'openssl', path, cert }) => {
  // prettier-ignore
  const args = [
    'x509',
    ...(path ? ['-in', path] : []),
    '-noout',
    '-dates'
  ];

  const promise = run(openssl, args, { stdio: 'pipe' });

  // Write certificate to stdin and capture stdout.
  const { child } = promise;
  const { stdin, stdout, stderr } = child;
  if (cert) stdin.write(cert);

  const cap = settleable();
  let out = '';
  stdout.on('data', chunk => (out += chunk));
  stderr.on('data', () => {});
  child.on('close', () => cap.resolve(out));

  // Parse OpenSSL's output of two lines with key=value pairs.
  const lines = (await cap.promise).split(/\r?\n/u);

  let [label, date] = lines[0].split('=');
  assert(label === 'notBefore');
  const notBefore = new Date(date);

  [label, date] = lines[1].split('=');
  assert(label === 'notAfter');
  const notAfter = new Date(date);

  // Done.
  return { notBefore, notAfter };
};

// -----------------------------------------------------------------------------

/**
 * Load the TLS certificate and key from the given directory. If the certificate
 * does not exist, is not yet valid, or has already expired, or if the private
 * key does not exist, this function recreates a new certificate and key first.
 * That requires OpenSSL being installed and on path.
 */
export const refreshen = async ({ openssl = 'openssl', path }) => {
  const certPath = join(path, LOCALHOST_CRT);
  const keyPath = join(path, LOCALHOST_KEY);
  let cert, key;

  let trials = 3;
  while (--trials > 0) {
    try {
      // Read the certificate and key.
      cert = await readFile(certPath);
      key = await readFile(keyPath);

      // Read the not-before and not-after dates.
      const { notBefore, notAfter } = await readCertDates({ openssl, cert });

      // Validate against current datetime and be done on success.
      const now = new Date();
      if (notBefore < now && now < notAfter) return { cert, key };
    } catch (x) {
      if (x.code !== 'ENOENT') throw x;
    }

    // If one of the above steps fails, we probably need a new certificate.
    await certifyLocalhost({ openssl, path });
  }

  // Something isn't quite working out. Fail loudly.
  throw new Error(
    `Unable to read TLS server certificate and key ` +
      `despite three attempts at regeneration.\n` +
      `Please check that OpenSSL is properly installed and on system path`
  );
};
