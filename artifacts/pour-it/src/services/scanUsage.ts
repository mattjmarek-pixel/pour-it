import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local-only, one-time allowance shared by all app modes. There is deliberately
 * no mode in this key and no expiry/renewal behavior.
 */
export const AI_VISION_USAGE_KEY = 'ai_vision_usage:v1';
export const AI_VISION_SCAN_LIMIT = 3;

// REVIEW BUILDS ONLY: set EXPO_PUBLIC_AI_VISION_REVIEWER_BYPASS=true when
// producing an App Store/Google Play review build. This is a build-time config
// flag, not an account or production entitlement. It defaults to OFF.
export function isReviewerBypassEnabled(): boolean {
  return process.env.EXPO_PUBLIC_AI_VISION_REVIEWER_BYPASS === 'true';
}

type UsageRead =
  | { status: 'known'; count: number }
  | { status: 'unknown'; reason: 'read_failed' | 'corrupt' };

export type VisionAllowanceUnknownReason =
  | 'read_failed'
  | 'corrupt'
  | 'write_failed'
  | 'cancelled'
  | 'already_finalized';

export interface VisionAllowanceAttempt {
  readonly id: number;
}

export type VisionAllowanceDecision =
  | {
      status: 'allowed';
      reservation: VisionAllowanceAttempt;
    }
  | { status: 'exhausted' }
  | { status: 'unknown'; reason: VisionAllowanceUnknownReason };

export type VisionAllowanceCommit =
  | { status: 'committed' }
  | { status: 'bypassed' }
  | { status: 'unknown'; reason: VisionAllowanceUnknownReason };

type AttemptState = 'pending' | 'reserved' | 'bypassed' | 'held' | 'cancelled';

/**
 * All usage reads, reservations, and writes share one queue. The in-memory
 * reservations are important: a second ScanView cannot start a fourth AI
 * capture while the first three successful candidates are still unresolved.
 */
let operationQueue: Promise<unknown> = Promise.resolve();
let nextAttemptId = 1;
let reservedCount = 0;
let persistenceFailure = false;
const attempts = new Map<number, AttemptState>();

function enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function readUsage(): Promise<UsageRead> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(AI_VISION_USAGE_KEY);
  } catch {
    return { status: 'unknown', reason: 'read_failed' };
  }

  // Missing storage means this device has not used any free scans yet.
  if (raw === null) return { status: 'known', count: 0 };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'number' &&
      Number.isInteger(parsed) &&
      parsed >= 0 &&
      parsed <= AI_VISION_SCAN_LIMIT
    ) {
      return { status: 'known', count: parsed };
    }
  } catch {
    // Malformed JSON is handled as unknown below rather than resetting to 0.
  }

  return { status: 'unknown', reason: 'corrupt' };
}

/**
 * Synchronous entry point used before the async allowance read. A caller must
 * invoke releaseVisionAllowance or commitVisionAllowance for this attempt.
 */
export function beginVisionAllowanceCheck(): VisionAllowanceAttempt {
  const attempt = { id: nextAttemptId++ };
  attempts.set(attempt.id, 'pending');
  return attempt;
}

/**
 * Reads the persisted count and reserves one of the remaining in-memory
 * permits. The operation queue makes concurrent ScanViews deterministic.
 */
export function resolveVisionAllowance(
  attempt: VisionAllowanceAttempt
): Promise<VisionAllowanceDecision> {
  return enqueue<VisionAllowanceDecision>(async () => {
    const state = attempts.get(attempt.id);
    if (!state) {
      return { status: 'unknown', reason: 'already_finalized' };
    }
    if (state === 'cancelled') {
      attempts.delete(attempt.id);
      return { status: 'unknown', reason: 'cancelled' };
    }

    if (isReviewerBypassEnabled()) {
      attempts.set(attempt.id, 'bypassed');
      return { status: 'allowed', reservation: attempt };
    }

    // A failed commit is held for this process so we never silently spend
    // another permit after storage has become unreliable.
    if (persistenceFailure) {
      attempts.set(attempt.id, 'held');
      return { status: 'unknown', reason: 'write_failed' };
    }

    const usage = await readUsage();
    if (attempts.get(attempt.id) === 'cancelled') {
      attempts.delete(attempt.id);
      return { status: 'unknown', reason: 'cancelled' };
    }
    if (usage.status === 'unknown') {
      attempts.delete(attempt.id);
      return { status: 'unknown', reason: usage.reason };
    }

    if (usage.count + reservedCount >= AI_VISION_SCAN_LIMIT) {
      attempts.delete(attempt.id);
      return { status: 'exhausted' };
    }

    reservedCount += 1;
    attempts.set(attempt.id, 'reserved');
    return { status: 'allowed', reservation: attempt };
  }).catch(() => {
    // An unexpected storage/queue error is still fail-closed and recoverable.
    attempts.delete(attempt.id);
    return { status: 'unknown', reason: 'read_failed' as const };
  });
}

/**
 * Releases a reservation for a failed, uncertain, mismatched, or otherwise
 * unusable identification. This never changes persisted usage.
 */
export function releaseVisionAllowance(attempt: VisionAllowanceAttempt): void {
  const state = attempts.get(attempt.id);
  if (state === 'reserved') {
    reservedCount = Math.max(0, reservedCount - 1);
  }
  if (state === 'pending' || state === 'reserved' || state === 'bypassed') {
    attempts.delete(attempt.id);
  }
}

/**
 * Synchronously invalidates a pending/reserved attempt during unmount or
 * navigation. Keeping a cancelled marker until queued work observes it makes
 * cancellation win the commit race before AsyncStorage.setItem starts.
 */
export function cancelVisionAllowance(attempt: VisionAllowanceAttempt): void {
  const state = attempts.get(attempt.id);
  if (!state || state === 'held' || state === 'cancelled') return;
  if (state === 'reserved') {
    reservedCount = Math.max(0, reservedCount - 1);
  }
  attempts.set(attempt.id, 'cancelled');
}

/**
 * Commits exactly one usable matched/AI product. A persistence failure holds
 * the reservation and blocks future spending for this process. The caller must
 * not present the product unless this returns committed or bypassed.
 */
export function commitVisionAllowance(
  attempt: VisionAllowanceAttempt
): Promise<VisionAllowanceCommit> {
  return enqueue<VisionAllowanceCommit>(async () => {
    const state = attempts.get(attempt.id);
    if (!state) return { status: 'unknown', reason: 'already_finalized' };

    if (state === 'cancelled') {
      attempts.delete(attempt.id);
      return { status: 'unknown', reason: 'cancelled' };
    }
    if (state === 'bypassed') {
      attempts.delete(attempt.id);
      return { status: 'bypassed' };
    }

    if (state !== 'reserved') {
      return { status: 'unknown', reason: 'already_finalized' };
    }

    const usage = await readUsage();
    if (attempts.get(attempt.id) === 'cancelled') {
      // Cancellation may have happened while the read was in flight. Do not
      // begin a write after navigation.
      attempts.delete(attempt.id);
      return { status: 'unknown', reason: 'cancelled' };
    }
    if (usage.status === 'unknown') {
      attempts.set(attempt.id, 'held');
      persistenceFailure = true;
      return { status: 'unknown', reason: usage.reason };
    }

    // A different writer may have filled the allowance. Do not overwrite it
    // or report a successful commit when this local reservation cannot persist.
    if (usage.count >= AI_VISION_SCAN_LIMIT) {
      attempts.set(attempt.id, 'held');
      persistenceFailure = true;
      return { status: 'unknown', reason: 'write_failed' };
    }

    try {
      await AsyncStorage.setItem(
        AI_VISION_USAGE_KEY,
        JSON.stringify(usage.count + 1)
      );
    } catch {
      if (attempts.get(attempt.id) === 'cancelled') {
        attempts.delete(attempt.id);
        return { status: 'unknown', reason: 'cancelled' };
      }
      attempts.set(attempt.id, 'held');
      persistenceFailure = true;
      return { status: 'unknown', reason: 'write_failed' };
    }

    if (attempts.get(attempt.id) === 'cancelled') {
      // The write may already have reached AsyncStorage. It cannot be safely
      // rolled back without risking a lost concurrent update; suppress the
      // product callback instead.
      attempts.delete(attempt.id);
      return { status: 'unknown', reason: 'cancelled' };
    }
    attempts.delete(attempt.id);
    reservedCount = Math.max(0, reservedCount - 1);
    return { status: 'committed' };
  }).catch(() => {
    if (attempts.get(attempt.id) === 'cancelled') {
      attempts.delete(attempt.id);
      return { status: 'unknown', reason: 'cancelled' as const };
    }
    // Never throw into the scan flow. Keep the permit held so the caller can
    // show the recoverable allowance error and suppress product delivery.
    attempts.set(attempt.id, 'held');
    persistenceFailure = true;
    return { status: 'unknown', reason: 'write_failed' as const };
  });
}

/**
 * Test-only reset for module-state isolation. It never clears device storage.
 */
export function __resetVisionUsageStateForTests(): void {
  attempts.clear();
  nextAttemptId = 1;
  reservedCount = 0;
  persistenceFailure = false;
  operationQueue = Promise.resolve();
}