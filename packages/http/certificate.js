/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { EOL } from 'os';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { parseDateOpenSSL } from './util.js';
import { promises } from 'fs';
import { spawn } from 'child_process';

const LOCALHOST_CFG = 'localhost.cfg';
const LOCALHOST_CRT = 'localhost.crt';
const LOCALHOST_KEY = 'localhost.key';

const { mkdir, readFile } = promises;

// -----------------------------------------------------------------------------

/**
 * Create a new self-signed certificate. The certificate is restricted for use
 * as a server certificate for `localhost` for 30 days. Both certificate and
 * private key are stored in the directory with the given path. This function
 * expects that OpenSSL is installed and the executable is on the system's PATH.
 */
export const certifyLocalhost = async ({ openssl = 'openssl', path }) => {
  // Make sure the directory exists.
  await mkdir(path, { recursive: true });

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

  const child = spawn(openssl, args, { cwd: path });

  let out = '';
  child.stdout.on('data', chunk => (out += chunk));
  child.stderr.on('data', chunk => (out += chunk));

  return new Promise((resolve, reject) => {
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const indicator = signal ? `signal "${signal}"` : `code "${code}"`;
        const output = `output << EOM${EOL}${out}${EOL}EOM`;
        reject(new Error(`OpenSSL terminated with ${indicator} and ${output}`));
      }
    });
  });
};

// =============================================================================

// Helper function to convert (part of a) certificate to text.
const getCertInfo = ({ openssl = 'openssl', path, cert, info = '-text' }) => {
  assert((path == null && cert != null) || (path != null && cert == null));

  // prettier-ignore
  const args = [
    'x509',
    ...(path ? ['-in', path] : []),
    '-noout',
    info,
  ];

  const child = spawn(openssl, args);

  // Pipe certificate if in memory.
  if (cert) child.stdin.write(cert);

  // Capture stdout with printed information, drop stderr to floor.
  let out = '';
  child.stdout.on('data', chunk => (out += chunk));
  child.stderr.on('data', () => {});

  return new Promise((resolve, reject) => {
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve(out);
      } else if (signal != null) {
        reject(new Error(`OpenSSL terminated with signal "${signal}"`));
      } else {
        reject(new Error(`OpenSSL terminated with code "${code}"`));
      }
    });
  });
};

// -----------------------------------------------------------------------------

/**
 * Read the not-before and not-after dates from a certificate. If `path` is
 * defined, the certificate is stored in a file with that path. If `cert` is
 * defined instead, the certificate is passed by value. This function expects
 * that OpenSSL is installed and on the path.
 */
export const readCertDates = async ({ openssl = 'openssl', path, cert }) => {
  const output = getCertInfo({ openssl, path, cert, info: '-dates' });

  // Parse OpenSSL's output of two lines with key=value pairs.
  const lines = (await output).split(/\r?\n/u);

  let [label, date] = lines[0].split('=');
  assert(label === 'notBefore');
  const notBefore = parseDateOpenSSL(date);

  [label, date] = lines[1].split('=');
  assert(label === 'notAfter');
  const notAfter = parseDateOpenSSL(date);

  // Done.
  return { notBefore, notAfter };
};

// -----------------------------------------------------------------------------

/** Convert a certificate to its human-readable representation. */
export const dumpCertificate = /* async */ ({
  openssl = 'openssl',
  path,
  cert,
}) => getCertInfo({ openssl, path, cert });

// =============================================================================

/**
 * Load the TLS certificate and key from the given directory. If the certificate
 * does not exist, the certificate is not yet valid, the certificate is about to
 * expire, or the private key does not exist, this function automatically
 * recreates a new self-signed certificate and key. This function treats a
 * certificate as expired `epsilon` seconds before its actual expiration.
 * OpenSSL or its fork LibreSSL must be installed and on the system path.
 */
export const refreshen = async ({
  openssl = 'openssl',
  path,
  epsilon = 10 * 60,
}) => {
  const certPath = join(path, LOCALHOST_CRT);
  const keyPath = join(path, LOCALHOST_KEY);

  const readChecked = async () => {
    // Read the certificate and private key.
    const cert = await readFile(certPath);
    const key = await readFile(keyPath);

    // Extract the not-before and not-after dates.
    const { notBefore, notAfter } = await readCertDates({ openssl, cert });

    // Validate against current time.
    const now = Date.now();
    if (notBefore <= now && now <= notAfter - epsilon * 1000) {
      return { cert, key };
    }

    const lower = new Date(notBefore).toISOString();
    const upper = new Date(notAfter).toISOString();
    const error = new Error(`Certificate valid from ${lower} to ${upper}`);
    error.code = 'CERT_INVALID';
    throw error;
  };

  // Try to read and validate certificate (plus private key).
  try {
    return await readChecked();
  } catch (x) {
    if (x.code !== 'ENOENT' && x.code !== 'CERT_INVALID') throw x;
  }

  // Either the file didn't exist or the certificate wasn't valid. So we create
  // a new self-signed certificate and try to read and validate again.
  await certifyLocalhost({ openssl, path });
  return readChecked();
};
