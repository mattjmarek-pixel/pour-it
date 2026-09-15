import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AI_VISION_SCAN_LIMIT,
  AI_VISION_USAGE_KEY,
  __resetVisionUsageStateForTests,
  beginVisionAllowanceCheck,
  cancelVisionAllowance,
  commitVisionAllowance,
  releaseVisionAllowance,
  resolveVisionAllowance,
} from '@/src/services/scanUsage';

const storage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    storage.set(key, value);
    return Promise.resolve();
  }),
}));

describe('AI vision local allowance', () => {
  beforeEach(() => {
    storage.clear();
    delete process.env.EXPO_PUBLIC_AI_VISION_REVIEWER_BYPASS;
    jest.clearAllMocks();
    __resetVisionUsageStateForTests();
  });

  async function allow() {
    const attempt = beginVisionAllowanceCheck();
    const result = await resolveVisionAllowance(attempt);
    expect(result.status).toBe('allowed');
    if (result.status !== 'allowed') throw new Error('expected an allowance');
    return { attempt, result };
  }

  it('treats a missing key as unused and commits exactly three scans', async () => {
    expect(AI_VISION_USAGE_KEY).toBe('ai_vision_usage:v1');

    for (let count = 1; count <= AI_VISION_SCAN_LIMIT; count += 1) {
      const { attempt } = await allow();
      await expect(commitVisionAllowance(attempt)).resolves.toEqual({
        status: 'committed',
      });
      expect(JSON.parse(storage.get(AI_VISION_USAGE_KEY) ?? '')).toBe(count);
    }

    const exhausted = beginVisionAllowanceCheck();
    await expect(resolveVisionAllowance(exhausted)).resolves.toEqual({
      status: 'exhausted',
    });
  });

  it('does not deduct failed scans when their reservations are released', async () => {
    const first = await allow();
    releaseVisionAllowance(first.attempt);
    const second = await allow();
    await expect(commitVisionAllowance(second.attempt)).resolves.toEqual({
      status: 'committed',
    });
    expect(JSON.parse(storage.get(AI_VISION_USAGE_KEY) ?? '')).toBe(1);
  });

  it('serializes global reservations so concurrent ScanViews cannot exceed three', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, async () => {
        const attempt = beginVisionAllowanceCheck();
        return { attempt, result: await resolveVisionAllowance(attempt) };
      })
    );

    expect(results.filter(({ result }) => result.status === 'allowed')).toHaveLength(3);
    expect(results.filter(({ result }) => result.status === 'exhausted')).toHaveLength(1);

    await Promise.all(
      results
        .filter(
          (
            entry
          ): entry is {
            attempt: ReturnType<typeof beginVisionAllowanceCheck>;
            result: { status: 'allowed'; reservation: ReturnType<typeof beginVisionAllowanceCheck> };
          } => entry.result.status === 'allowed'
        )
        .map(({ attempt }) => commitVisionAllowance(attempt))
    );
    expect(JSON.parse(storage.get(AI_VISION_USAGE_KEY) ?? '')).toBe(3);
  });

  it('fails closed for corrupt or unreadable storage', async () => {
    storage.set(AI_VISION_USAGE_KEY, '{"count":2}');
    const corruptAttempt = beginVisionAllowanceCheck();
    await expect(resolveVisionAllowance(corruptAttempt)).resolves.toMatchObject({
      status: 'unknown',
      reason: 'corrupt',
    });

    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const unreadableAttempt = beginVisionAllowanceCheck();
    await expect(resolveVisionAllowance(unreadableAttempt)).resolves.toMatchObject({
      status: 'unknown',
      reason: 'read_failed',
    });
    expect(storage.get(AI_VISION_USAGE_KEY)).toBe('{"count":2}');
  });

  it('holds the permit after a failed commit without reporting the product as failed', async () => {
    const { attempt } = await allow();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

    await expect(commitVisionAllowance(attempt)).resolves.toEqual({
      status: 'unknown',
      reason: 'write_failed',
    });

    const blocked = beginVisionAllowanceCheck();
    await expect(resolveVisionAllowance(blocked)).resolves.toEqual({
      status: 'unknown',
      reason: 'write_failed',
    });
  });

  it('cannot produce a fourth usable result after a failed third write across restart', async () => {
    storage.set(AI_VISION_USAGE_KEY, '2');
    const { attempt } = await allow();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(commitVisionAllowance(attempt)).resolves.toMatchObject({
      status: 'unknown',
      reason: 'write_failed',
    });

    // Simulate a process restart: only persisted data survives, and the failed
    // third write did not deliver a product to the user.
    __resetVisionUsageStateForTests();
    const retry = await allow();
    await expect(commitVisionAllowance(retry.attempt)).resolves.toEqual({
      status: 'committed',
    });
    expect(storage.get(AI_VISION_USAGE_KEY)).toBe('3');

    const fourth = beginVisionAllowanceCheck();
    await expect(resolveVisionAllowance(fourth)).resolves.toEqual({
      status: 'exhausted',
    });
  });

  it('cancellation wins a queued commit before it can write', async () => {
    const { attempt } = await allow();
    cancelVisionAllowance(attempt);

    await expect(commitVisionAllowance(attempt)).resolves.toEqual({
      status: 'unknown',
      reason: 'cancelled',
    });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('bypasses the allowance only when the review-build flag is explicitly enabled', async () => {
    process.env.EXPO_PUBLIC_AI_VISION_REVIEWER_BYPASS = 'true';
    storage.set(AI_VISION_USAGE_KEY, JSON.stringify(AI_VISION_SCAN_LIMIT));

    const attempt = beginVisionAllowanceCheck();
    await expect(resolveVisionAllowance(attempt)).resolves.toEqual({
      status: 'allowed',
      reservation: attempt,
    });
    await expect(commitVisionAllowance(attempt)).resolves.toEqual({
      status: 'bypassed',
    });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});