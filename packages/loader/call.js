/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import pickle from '@grr/oddjob/pickle';

const { create, keys: keysOf } = Object;
const DUMMY = new URL('./dummy.js', import.meta.url).href;
const DUMMY_HASH = DUMMY + '#';
const MAGIC_PREFIX = '@grr/loader/invoke/';
const { parse } = JSON;

// -----------------------------------------------------------------------------

const Request = create(null, {
  /** Determine whether the specifier represents an XPC request. */
  is: {
    value(specifier) {
      return specifier.startsWith(MAGIC_PREFIX);
    },
  },
  /** Deserialize the specifier into an XPC request. */
  to: {
    value(specifier) {
      assert(specifier.startsWith(MAGIC_PREFIX));
      const cut = specifier.indexOf('/', MAGIC_PREFIX.length);
      if (cut === -1) return {};

      return {
        command: specifier.slice(MAGIC_PREFIX.length, cut),
        data: parse(specifier.slice(cut + 1)),
      };
    },
  },
});

const Response = create(null, {
  /** Determine whether the module URL represents an XPC response. */
  is: {
    value(url) {
      return url.startsWith(DUMMY_HASH);
    },
  },
  /**
   * Serialize the XPC response as the text of a module, to be returned from
   * the `translateCode()` hook.
   */
  to: {
    value(data) {
      return { source: `export default ${pickle(data)};` };
    },
  },
});

export default class Call {
  static get Request() {
    return Request;
  }

  static get Response() {
    return Response;
  }

  // ---------------------------------------------------------------------------

  #id = 1;
  #pending = new Map();
  #actions;

  /** Create a new XPC call handler that supports the given actions. */
  constructor(actions) {
    assert(
      actions != null && typeof actions === 'object',
      'XPC call handler requires object with supported actions'
    );

    const checkedActions = create(null);
    for (const command of keysOf(actions)) {
      const action = actions[command];
      assert(typeof action === 'function');
      checkedActions[command] = action;
    }
    this.#actions = checkedActions;
  }

  /** Handle an XPC request in the resolve() hook. */
  async handleRequest(specifier) {
    const { command, data } = Call.Request.to(specifier);
    const action = command ? this.#actions[command] : null;

    let result;
    if (command == null) {
      result = { error: `Malformed XPC request "${specifier}"` };
    } else if (typeof action !== 'function') {
      result = { error: `XPC command "${command}" is not implemented` };
    } else {
      try {
        result = { value: await action(data) };
      } catch (x) {
        result = { error: x.message, stack: x.stack };
      }
    }

    const url = `${DUMMY}#${this.#id}`;
    this.#id += 1;
    this.#pending.set(url, Call.Response.to(result));
    return { url };
  }

  /** Handle the corresponding XPC response in the translateSource() hook. */
  handleResponse(url) {
    assert(this.#pending.has(url));
    const response = this.#pending.get(url);
    this.#pending.delete(url);
    return response;
  }
}
