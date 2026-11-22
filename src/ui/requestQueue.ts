export function createRequestQueue(limit: number) {
  const pending: (() => Promise<void>)[] = [];
  let running = 0;

  function drain() {
    while (running < limit && pending.length > 0) {
      const job = pending.shift()!;
      running++;
      void job().finally(() => {
        running--;
        drain();
      });
    }
  }

  return function enqueue<T>(signal: AbortSignal, request: () => Promise<T>, priority = false): Promise<T> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Request cancelled", "AbortError"));
        return;
      }
      const cancel = () => {
        const index = pending.indexOf(job);
        if (index !== -1) {
          pending.splice(index, 1);
          reject(new DOMException("Request cancelled", "AbortError"));
        }
      };
      const job = async () => {
        signal.removeEventListener("abort", cancel);
        try {
          resolve(await request());
        } catch (error) {
          reject(error);
        }
      };
      signal.addEventListener("abort", cancel, { once: true });
      if (priority) pending.unshift(job);
      else pending.push(job);
      drain();
    });
  };
}
