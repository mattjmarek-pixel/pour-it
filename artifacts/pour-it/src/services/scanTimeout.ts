export const IDENTIFY_TIMEOUT_MS = 12_000;

export class ScanTimeoutError extends Error {
  constructor() {
    super('Scan identification timed out');
    this.name = 'ScanTimeoutError';
  }
}

export function withScanTimeout<T>(
  operation: Promise<T>,
  onTimeout?: () => void,
  timeoutMs = IDENTIFY_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new ScanTimeoutError());
    }, timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export interface ScanDeadline {
  run<T>(operation: Promise<T>, onTimeout?: () => void): Promise<T>;
}

export function createScanDeadline(
  timeoutMs = IDENTIFY_TIMEOUT_MS
): ScanDeadline {
  const expiresAt = Date.now() + timeoutMs;

  return {
    run<T>(operation: Promise<T>, onTimeout?: () => void): Promise<T> {
      const remainingMs = Math.max(0, expiresAt - Date.now());
      return withScanTimeout(operation, onTimeout, remainingMs);
    },
  };
}