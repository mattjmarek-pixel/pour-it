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