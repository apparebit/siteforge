/* © 2020 Robert Grimm */

import { constants } from 'http2';
const { assign, create, entries: entriesOf, freeze } = Object;

const STATUS_PREFIX = 'HTTP_STATUS_';
const HEADER_PREFIX = 'HTTP2_HEADER_';
const X_PREFIX = 'X_';

const reformat = key =>
  key.toLowerCase().replace(/(?:^|_)(.)/gu, (_, s) => s.toUpperCase());

const prepare = () => {
  const StatusCode = create(null);
  const Header = create(null);

  // Reuse existing constants from http2 module.
  for (let [key, value] of entriesOf(constants)) {
    if (key.startsWith(STATUS_PREFIX)) {
      key = reformat(key.slice(STATUS_PREFIX.length));
      StatusCode[key] = value;
    } else if (key.startsWith(HEADER_PREFIX)) {
      key = key.slice(HEADER_PREFIX.length);
      if (key.startsWith(X_PREFIX)) {
        key = key.slice(X_PREFIX.length);
      }
      key = reformat(key);
      Header[key] = value;
    }
  }

  Header.LastEventId = 'last-event-id';
  Header.ReferrerPolicy = 'referrer-policy';
  Header.PermittedCrossDomainPolicies = 'x-permitted-cross-domain-policies';
  Header.PoweredBy = 'x-powered-by';
  Header.Query = ':query'; // Useful when normalizing `:path`.

  // Only reuse HTTP/2 methods.
  const MethodName = create(null);
  MethodName.CONNECT = constants.HTTP2_METHOD_CONNECT;
  MethodName.DELETE = constants.HTTP2_METHOD_DELETE;
  MethodName.GET = constants.HTTP2_METHOD_GET;
  MethodName.HEAD = constants.HTTP2_METHOD_HEAD;
  MethodName.OPTIONS = constants.HTTP2_METHOD_OPTIONS;
  MethodName.PATCH = constants.HTTP2_METHOD_PATCH;
  MethodName.POST = constants.HTTP2_METHOD_POST;
  MethodName.PUT = constants.HTTP2_METHOD_PUT;

  const StatusWithoutBody = assign(create(null), {
    204: true,
    205: true,
    304: true,
  });

  return {
    Header: freeze(Header),
    MethodName: freeze(MethodName),
    StatusCode: freeze(StatusCode),
    StatusWithoutBody: freeze(StatusWithoutBody),
  };
};

export const { Header, MethodName, StatusCode, StatusWithoutBody } = prepare();

export const kSessionId = Symbol('Session ID');
