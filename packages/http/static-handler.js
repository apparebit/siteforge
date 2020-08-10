/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { constants } from 'http2';
import { isAbsolute, join, normalize } from 'path';
import { default as MediaType } from './media-type.js';
import { default as mediaTypeForPath } from './file-type.js';

const {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_NOT_MODIFIED,
  HTTP_STATUS_PERMANENT_REDIRECT,
  HTTP_STATUS_OK,
  HTTP2_HEADER_CONTENT_LENGTH,
  HTTP2_HEADER_LAST_MODIFIED,
  HTTP2_HEADER_STATUS,
} = constants;

const InnerState = {
  TryingPath: Symbol('path'),
  TryingIndexFile: Symbol('path + "/index.html"'),
  TryingDotHtml: Symbol('path + ".html"'),
};

const createStaticContentHandler = ({ root }) => {
  assert(isAbsolute((root = normalize(root))));
  if (!root.endsWith('/')) root = `${root}/`;

  const handleStaticContent = (exchange, next) => {
    if (exchange.endsInSlash) {
      return exchange.redirect(
        HTTP_STATUS_PERMANENT_REDIRECT,
        exchange.origin + exchange.path
      );
    }

    exchange.file(root + exchange.path.slice(1), respondWithStaticContent);
    return next();
  };

  return handleStaticContent;
};

const respondWithStaticContent = (exchange, path) => {
  let state = InnerState.TryingOriginalPath;

  // eslint-disable-next-line consistent-return
  const statCheck = (fileStatus, headers) => {
    if (!exchange.isModified(fileStatus.mtime)) {
      // Send minimal response and stop Node.js from sending file.
      exchange.send(HTTP_STATUS_NOT_MODIFIED);
      return false;
    }

    headers[HTTP2_HEADER_CONTENT_LENGTH] = fileStatus.size;
    headers[HTTP2_HEADER_LAST_MODIFIED] = fileStatus.mtime.toUTCString();
    headers[HTTP2_HEADER_STATUS] =
      headers[HTTP2_HEADER_STATUS] ?? HTTP_STATUS_OK;
    return exchange.prepare(headers);
  };

  const onError = error => {
    if (exchange.isDone() || exchange.stream.headersSent) {
      // Nothing to do.
    } else if (error.code === 'ENOENT') {
      if (state === InnerState.TryingOriginal) {
        state = InnerState.TryingDotHtml;
        const path2 = path + '.html';
        exchange.type = MediaType.HTML;
        exchange.stream.respondWithFile(path2, exchange.response, {
          statCheck,
          onError,
        });
      } else {
        exchange.fail(HTTP_STATUS_NOT_FOUND, error);
      }
    } else if (error.code === 'ERR_HTTP2_SEND_FILE') {
      if (state === InnerState.TryingOriginal) {
        state = InnerState.TryingIndexFile;
        const path2 = join(path, 'index.html');
        exchange.type = MediaType.HTML;
        exchange.stream.respondWithFile(path2, exchange.response, {
          statCheck,
          onError,
        });
      } else {
        exchange.fail(HTTP_STATUS_INTERNAL_SERVER_ERROR, error);
      }
    }
  };

  exchange.type = mediaTypeForPath(path);
  exchange.stream.respondWithFile(path, exchange.response, {
    statCheck,
    onError,
  });
  return exchange.didRespond;
};

export default createStaticContentHandler;
