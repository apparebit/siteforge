/* © 2020 Robert Grimm */

import { constants } from 'http2';
const { create, entries: entriesOf, freeze } = Object;

const STATUS_PREFIX = 'HTTP_STATUS_';
const HEADER_PREFIX = 'HTTP2_HEADER_';
const X_PREFIX = 'X_';

const reformat = key =>
  key.toLowerCase().replace(/(?:^|_)(.)/gu, (_, s) => s.toUpperCase());

const prepare = () => {
  const Status = create(null);
  const Header = create(null);

  // Reuse existing constants from http2 module.
  for (let [key, value] of entriesOf(constants)) {
    if (key.startsWith(STATUS_PREFIX)) {
      key = reformat(key.slice(STATUS_PREFIX.length));
      Status[key] = value;
    } else if (key.startsWith(HEADER_PREFIX)) {
      key = key.slice(HEADER_PREFIX.length);
      if (key.startsWith(X_PREFIX)) {
        key = key.slice(X_PREFIX.length);
      }
      key = reformat(key);
      Header[key] = value;
    }
  }

  // Add missing constants.
  Header.Body = ':body';
  Header.ReferrerPolicy = 'referrer-policy';
  Header.PermittedCrossDomainPolicies = 'x-permitted-cross-domain-policies';
  Header.PoweredBy = 'x-powered-by';

  // Only reuse HTTP/2 methods.
  const Method = create(null);
  Method.CONNECT = constants.HTTP2_METHOD_CONNECT;
  Method.DELETE = constants.HTTP2_METHOD_DELETE;
  Method.GET = constants.HTTP2_METHOD_GET;
  Method.HEAD = constants.HTTP2_METHOD_HEAD;
  Method.OPTIONS = constants.HTTP2_METHOD_OPTIONS;
  Method.PATCH = constants.HTTP2_METHOD_PATCH;
  Method.POST = constants.HTTP2_METHOD_POST;
  Method.PUT = constants.HTTP2_METHOD_PUT;

  return {
    Header: freeze(Header),
    Method: freeze(Method),
    Status: freeze(Status),
  };
};

export const { Header, Method, Status } = prepare();
