import { strict } from 'assert';
import { newPromiseCapability } from './async';

let close, control;
const { nextTick } = process;
const SECRET = Symbol('secret');
const NOOP = () => {};
const ALREADY_DONE = new AlreadyDone(SECRET);
const NEVER_DONE = new NeverDone(SECRET);

class ActivityControl extends Promise {

}


export class Activity {
  /** Get the default activity, which never completes. */
  static get NeverDone() {
    return NEVER_DONE;
  }

  /** Get the negated activity, which is complete. */
  static get AlreadyDone() {
    return ALREADY_DONE;
  }

  #control;

  #handlers;
  #done;
  #resolve;

  /* private */ constructor(secret, parent) {
    strict.equal(secret, SECRET);

    this.#control = newPromiseCapability();
    this.#control =
    this.#control.return(result) {

    }

    this.#control.promsie = new Promise(resolve => (this.#conntrol.resolve = resolve));
    this.#control = {
      return(result) {},
      throw(reason) {},
    };

    this.#handlers = [];
    close = () => {
      if (!this.#handlers) return;
      const handlers = this.#handlers;
      this.#handlers = undefined;

      if (handlers.length) {
        nextTick(() => {
          for (const handler of handlers) {
            handler();
          }
        });
      }
    };

    if (parent) {
      if (parent.isDone()) {
        close();
      } else {
        const undo = parent.onDone(close);
        if (undo !== NOOP) this.#handlers.push(undo);
      }
    }
  }

  withClose() {
    if (!this.#handlers) {
      return { activity: ALREADY_DONE, close: NOOP };
    }

    const activity = new Activity(SECRET, this);
    return { activity, close };
  }

  withTimeout(duration) {
    if (!this.#handlers) {
      return { activity: ALREADY_DONE, close: NOOP };
    }

    const activity = new Activity(SECRET, this);
    {
      const timeout = setTimeout(close, duration);
      activity.#handlers.push(() => clearTimeout(timeout));
    }
    return { activity, close };
  }

  isDone() {
    return !this.#handlers;
  }

  onDone(handler) {
    strict.equal(typeof handler, 'function');
    if (!this.#handlers) {
      nextTick(handler);
      return NOOP;
    }

    this.#handlers.push(handler);

    let undone = false;
    const undoOnDone = () => {
      if (undone || !this.#handlers) return;
      undone = true;
      const index = this.#handlers.indexOf(handler);
      this.#handlers.splice(index, 1);
    };
    return undoOnDone;
  }
}

class NeverDone extends Activity {
  isDone() {
    return false;
  }

  onDone(handler) {
    strict.equal(typeof handler, 'function');
    return NOOP;
  }
}

class AlreadyDone extends Activity {
  constructor(secret) {
    super(secret);
    this.#handlers = undefined;
  }

  isDone() {
    return true;
  }

  onDone(handler) {
    strict.equal(typeof handler, 'function');
    nextTick(handler);
    return NOOP;
  }
}
