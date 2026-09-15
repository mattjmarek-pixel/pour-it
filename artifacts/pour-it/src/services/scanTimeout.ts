// Camera capture consumes part of this same end-to-end budget. Production
// identify requests have taken ~11 seconds on their own, so 12 seconds caused
// valid responses to be aborted before they could reach the client.
export const IDENTIFY_TIMEOUT_MS = 20_000;

export class ScanTimeoutError extends Error {
  constructor() {
    super('Scan identification timed out');
    this.name = 'ScanTimeoutError';
  }
}

export class ScanCancelledError extends Error {
  constructor() {
    super('Scan identification cancelled');
    this.name = 'ScanCancelledError';
  }
}

export function withScanTimeout<T>(
  operation: Promise<T>,
  onTimeout?: () => void,
  timeoutMs = IDENTIFY_TIMEOUT_MS,
  cancelSignal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      cancelSignal?.removeEventListener('abort', onCancel);
    };
    const onCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ScanCancelledError());
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cancelSignal?.removeEventListener('abort', onCancel);
      onTimeout?.();
      reject(new ScanTimeoutError());
    }, timeoutMs);

    if (cancelSignal?.aborted) {
      onCancel();
      return;
    }
    cancelSignal?.addEventListener('abort', onCancel, { once: true });

    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
    );
  });
}

export interface ScanDeadline {
  run<T>(operation: Promise<T>, onTimeout?: () => void): Promise<T>;
  cancel(): void;
}

export function createScanDeadline(
  timeoutMs = IDENTIFY_TIMEOUT_MS
): ScanDeadline {
  const expiresAt = Date.now() + timeoutMs;
  const cancellationController = new AbortController();

  return {
    run<T>(operation: Promise<T>, onTimeout?: () => void): Promise<T> {
      const remainingMs = Math.max(0, expiresAt - Date.now());
      return withScanTimeout(
        operation,
        onTimeout,
        remainingMs,
        cancellationController.signal
      );
    },
    cancel(): void {
      cancellationController.abort();
    },
  };
}