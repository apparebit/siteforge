// © 2020 Robert Grimm

import https from 'https';
import { networkInterfaces } from 'os';
import { promises } from 'fs';

const { keys: keysOf } = Object;
const { readFile } = promises;

const onShutdown = fn => {
  let done = false;

  const wrapper = () => {
    if (!done) {
      done = true;
      fn();
    }
  };

  process.on('SIGINT', wrapper);
  process.on('SIGTERM', wrapper);
  process.on('exit', wrapper);
};

const addressV4 = () => {
  const interfaces = networkInterfaces();
  for (const name of keysOf(interfaces)) {
    for (const iface of interfaces[name]) {
      const { address, family, internal } = iface;
      if (family === 'IPv4' && !internal) {
        return address;
      }
    }
  }
  throw new Error(`no routable IPv4 interface available`);
};

export default async function serve(config) {
  const server = https.createServer(
    {
      key: await readFile(config.options.tlsKey),
      cert: await readFile(config.options.tlsCert),
    },
    (req, res, next) => 665
  );

  server.on('error', error => {});

  server.listen(...null, async () => {
    onShutdown(() => server.close());
  });
}
