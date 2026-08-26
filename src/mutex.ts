export class Mutex {
  #queue: Array<() => void> = [];
  #locked = false;

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.#locked) {
        this.#locked = true;
        resolve();
      } else {
        this.#queue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.#queue.length > 0) {
      const next = this.#queue.shift()!;
      next();
    } else {
      this.#locked = false;
    }
  }

  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
