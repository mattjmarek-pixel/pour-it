import {
  createScanDeadline,
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

  it('uses one deadline so capture time consumes the fetch budget', async () => {
    jest.useFakeTimers();
    const deadline = createScanDeadline(100);
    const capture = deadline.run(
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('photo'), 60);
      })
    );

    jest.advanceTimersByTime(60);
    await expect(capture).resolves.toBe('photo');

    const abortFetch = jest.fn();
    const fetchResult = deadline.run(
      new Promise<never>(() => {}),
      abortFetch
    );
    jest.advanceTimersByTime(39);
    expect(abortFetch).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await expect(fetchResult).rejects.toBeInstanceOf(ScanTimeoutError);
    expect(abortFetch).toHaveBeenCalledTimes(1);
  });
});