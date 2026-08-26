export class Mutex {
  #queue = [];
  #locked = false;

  async acquire() {
    return new Promise((resolve) => {
      if (!this.#locked) {
        this.#locked = true;
        resolve();
      } else {
        this.#queue.push(resolve);
      }
    });
  }

  release() {
    if (this.#queue.length > 0) {
      const next = this.#queue.shift();
      next();
    } else {
      this.#locked = false;
    }
  }

  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
