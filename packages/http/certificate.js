/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { dirname } from 'path';
import { EOL } from 'os';
import { parseDateOpenSSL } from './util.js';
import { promises } from 'fs';
import { spawn } from 'child_process';

const { mkdir, readFile, writeFile } = promises;

// NB: OpenSSL used to require a configuration file for generating self-signed
// certificates. That changed with OpenSSL 1.1.0 thanks to the introduction of
// the `-addext` command line option. However, the implementation is buggy
// (https://github.com/openssl/openssl/issues/12940) and the option is not
// supported by LibreSSL. In short, we are stuck with the configuration file.

// -----------------------------------------------------------------------------

/**
 * Create a new configuration for certificate creation via OpenSSL. This
 * function returns an object. Its `config` property is the text for the
 * corresponding configuration file. Its `commonName` is the the text for the corresponding configuration file
 *
 */
export const createConfiguration = ({
  dns = ['localhost'],
  ip = ['127.0.0.1', '::ffff:7f00:1'],
} = {}) => {
  const names = dns.map(name => `DNS:${name}`).join(',');
  const addresses = ip.map(address => `IP:${address}`).join(',');

  let commonName, altNames;
  if (dns.length && ip.length) {
    commonName = dns[0];
    altNames = `${names},${addresses}`;
  } else if (dns.length) {
    commonName = dns[0];
    altNames = names;
  } else if (ip.length) {
    commonName = ip[0];
    altNames = addresses;
  } else {
    throw new TypeError(
      `Certificate must have at least one DNS name or IP address`
    );
  }

  return `[req]
prompt             = no
distinguished_name = dn
x509_extensions    = ext

[dn]
commonName         = ${commonName}

[ext]
basicConstraints   = critical,CA:FALSE
subjectAltName     = ${altNames}
keyUsage           = critical,digitalSignature,keyCertSign
extendedKeyUsage   = serverAuth
`;
};

/**
 * Create a promise for exit of the child process. If the child process exits
 * with a code of 0, the promise resolves with the child process' output and
 * error streams. Otherwise, the promise rejects with an appropriate error.
 */
const onExit = child => {
  // Capture output.
  let out = '';
  child.stdout.on('data', chunk => (out += chunk));
  child.stderr.on('data', chunk => (out += chunk));

  // Report exit condition.
  return new Promise((resolve, reject) => {
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve(out);
      } else {
        const event = signal ? `signal "${signal}"` : `code "${code}"`;
        const output = `output <<< EOM${EOL}${out}${EOL}EOM`;
        reject(new Error(`OpenSSL terminated with ${event} and ${output}`));
      }
    });
  });
};

// =============================================================================

/**
 * Create a new self-signed certificate for the given DNS names and IP
 * addresses. The certificate is valid for the given number of days. It is
 * stored in a file with the given path and the `.crt` extension. Its private
 * key is stored in a file with the same path and the `.key` extension. The
 * OpenSSL configuration is stored in a file with the same path and the `.cnf`
 * extension.
 */
export const createCertificate = async ({
  dns = ['localhost'],
  ip = ['127.0.0.1', '::ffff:7f00:1'],
  days = '30',
  path = './localhost',
  openssl = 'openssl',
} = {}) => {
  await mkdir(dirname(path), { recursive: true });

  await writeFile(
    path + '.cnf',
    createConfiguration({ dns, ip, path }),
    'utf8'
  );

  // prettier-ignore
  const child = spawn(openssl, [
    'req', '-x509',
    '-newkey', 'rsa:2048',
    '-nodes',
    '-keyout', path + '.key',
    '-config', path + '.cnf',
    '-sha256',
    '-days', days,
    '-out', path + '.crt',
  ]);

  return onExit(child);
};

// =============================================================================

const doParseCert = ({
  cert,
  path,
  openssl = 'openssl',
  info = '-text',
} = {}) => {
  if ((cert && path) || (!cert && !path)) {
    throw new TypeError(`Invoke function with either a certificate or a path`);
  }

  // prettier-ignore
  const child = spawn(openssl, [
    'x509',
    ...(path ? ['-in', path] : []),
    '-noout',
    info,
  ]);

  if (cert) child.stdin.write(cert);
  return onExit(child);
};

/**
 * Extract the not-before and not-after dates from a certificate, which is
 * either provided by value (`cert`) or by reference (`path`).
 */
export const parseValidity = async ({
  cert,
  path,
  openssl = 'openssl',
} = {}) => {
  const text = await doParseCert({ cert, path, openssl, info: '-dates' });
  const lines = text.split(/\r?\n/u);

  let [label, date] = lines[0].split('=');
  assert(label === 'notBefore');
  const notBefore = parseDateOpenSSL(date);

  [label, date] = lines[1].split('=');
  assert(label === 'notAfter');
  const notAfter = parseDateOpenSSL(date);

  // Done.
  return { notBefore, notAfter };
};

/**
 * Dump the entire certificate in human-readable representation. The certificate
 * can be provided by value (`cert`) or by reference (`path`).
 */
export const dumpCertificate = ({ cert, path, openssl = 'openssl' } = {}) =>
  doParseCert({ cert, path, openssl });

// =============================================================================

/** Load or create a self-signed certificate meeting the specification. */
export const certificate = async ({
  dns = ['localhost'],
  ip = ['127.0.0.1', '::ffff:7f00:1'],
  days = '30',
  path = './localhost',
  openssl = 'openssl',
  epsilon = 10 * 60,
} = {}) => {
  const certPath = path + '.crt';
  const keyPath = path + '.key';

  const load = async () => {
    const cert = await readFile(certPath, 'utf8');
    const key = await readFile(keyPath, 'utf8');

    const { notBefore, notAfter } = await parseValidity({ cert, openssl });
    const now = Date.now();
    if (notBefore <= now && now <= notAfter - epsilon * 1000) {
      return { cert, key };
    }

    const lower = new Date(notBefore).toISOString();
    const upper = new Date(notAfter).toISOString();
    const error = new Error(`Certificate only valid from ${lower} to ${upper}`);
    error.code = 'CERT_INVALID';
    throw error;
  };

  // Try loading certificate and key. If that doesn't work because there is no
  // certificate or the certificate isn't valid, create a new certificate and
  // try loading again.
  try {
    return await load();
  } catch (x) {
    if (x.code !== 'ENOENT' && x.code !== 'CERT_INVALID') throw x;
  }

  await createCertificate({ dns, ip, days, path, openssl });
  return load();
};
