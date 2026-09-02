import {
  ScanTimeoutError,
  withScanTimeout,
} from '../services/scanTimeout';

describe('scan identification timeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a stalled operation and invokes its cancellation callback', async () => {
    jest.useFakeTimers();
    const onTimeout = jest.fn();
    const pending = withScanTimeout(
      new Promise<never>(() => {}),
      onTimeout,
      25
    );

    jest.advanceTimersByTime(25);

    await expect(pending).rejects.toBeInstanceOf(ScanTimeoutError);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('returns a completed operation without invoking cancellation', async () => {
    const onTimeout = jest.fn();

    await expect(
      withScanTimeout(Promise.resolve('identified'), onTimeout, 25)
    ).resolves.toBe('identified');
    expect(onTimeout).not.toHaveBeenCalled();
  });
});