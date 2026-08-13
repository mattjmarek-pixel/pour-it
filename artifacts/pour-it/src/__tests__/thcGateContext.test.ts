/**
 * Adversarial tests for the client-side THC geo-gate (ThcGateContext).
 *
 * Every path must fail CLOSED: only an affirmative server-confirmed legal
 * state (with a signed location token in hand) ever reaches 'allowed'.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

// ---- mocks (must precede the import of the module under test) ----

const mockRequestPermissions = jest.fn();
const mockGetPosition = jest.fn();
const mockReverseGeocode = jest.fn();

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: (...a: unknown[]) => mockRequestPermissions(...a),
  getCurrentPositionAsync: (...a: unknown[]) => mockGetPosition(...a),
  reverseGeocodeAsync: (...a: unknown[]) => mockReverseGeocode(...a),
  Accuracy: { Balanced: 3 },
}));

let mockPlatformOS = 'ios';
jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
}));

const mockFetch = jest.fn();
(global as { fetch?: unknown }).fetch = mockFetch;

process.env.EXPO_PUBLIC_DOMAIN = 'test.example.com';

import { ThcGateProvider, useThcGate } from '../../context/ThcGateContext';
import type { ThcGateStatus } from '../../context/ThcGateContext';

// ---- harness ----

interface Captured {
  status: ThcGateStatus;
  stateAbbr: string | null;
  locationToken: string | null;
  verifyLocation: () => Promise<void>;
  ensureFresh: () => void;
  submitManualState: (abbr: string) => Promise<void>;
}

let captured: Captured;

function Probe() {
  captured = useThcGate() as unknown as Captured;
  return null;
}

async function renderGate(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      React.createElement(ThcGateProvider, null, React.createElement(Probe))
    );
  });
  return renderer;
}

function serverGrantsToken(token = 'signed-token-abc') {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ legal: true, locationToken: token }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatformOS = 'ios';
});

afterEach(() => {
  jest.useRealTimers();
});

// ---- tests ----

describe('GPS verification failure paths (fail closed)', () => {
  it('permission denied → unverified (manual fallback), never allowed, no token', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });
    await renderGate();
    await act(async () => captured.verifyLocation());
    expect(captured.status).toBe('unverified');
    expect(captured.locationToken).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reverse geocoding returns no result → unverified, not assumed legal', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });
    mockGetPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    mockReverseGeocode.mockResolvedValue([]);
    await renderGate();
    await act(async () => captured.verifyLocation());
    expect(captured.status).toBe('unverified');
    expect(captured.locationToken).toBeNull();
  });

  it('reverse geocoding throws → unverified', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });
    mockGetPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    mockReverseGeocode.mockRejectedValue(new Error('geocode down'));
    await renderGate();
    await act(async () => captured.verifyLocation());
    expect(captured.status).toBe('unverified');
  });

  it('geocode returns a non-US/unknown region → unverified', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });
    mockGetPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    mockReverseGeocode.mockResolvedValue([{ region: 'Ontario' }]);
    await renderGate();
    await act(async () => captured.verifyLocation());
    expect(captured.status).toBe('unverified');
  });

  it('web platform skips GPS entirely and goes to unverified/manual', async () => {
    mockPlatformOS = 'web';
    await renderGate();
    await act(async () => captured.verifyLocation());
    expect(captured.status).toBe('unverified');
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });
});

describe('GPS success paths', () => {
  it('legal state via GPS → requests server token → allowed with token', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });
    mockGetPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    mockReverseGeocode.mockResolvedValue([{ region: 'Illinois' }]);
    serverGrantsToken('tok-il');
    await renderGate();
    await act(async () => captured.verifyLocation());
    expect(captured.status).toBe('allowed');
    expect(captured.stateAbbr).toBe('IL');
    expect(captured.locationToken).toBe('tok-il');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/verify-thc-location');
    expect(JSON.parse(init.body)).toEqual({ state: 'IL' });
  });

  it('non-legal state via GPS → blocked immediately, no server call, no token', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });
    mockGetPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    mockReverseGeocode.mockResolvedValue([{ region: 'Texas' }]);
    await renderGate();
    await act(async () => captured.verifyLocation());
    expect(captured.status).toBe('blocked');
    expect(captured.locationToken).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('manual state selection', () => {
  it('non-legal state → blocked, no server call, no token', async () => {
    await renderGate();
    await act(async () => captured.submitManualState('TX'));
    expect(captured.status).toBe('blocked');
    expect(captured.stateAbbr).toBe('TX');
    expect(captured.locationToken).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('legal state → requests token from server → allowed', async () => {
    serverGrantsToken('tok-ca');
    await renderGate();
    await act(async () => captured.submitManualState('CA'));
    expect(captured.status).toBe('allowed');
    expect(captured.locationToken).toBe('tok-ca');
  });

  it('unknown/garbage selection → blocked', async () => {
    await renderGate();
    await act(async () => captured.submitManualState('NOT-A-STATE'));
    expect(captured.status).toBe('blocked');
    expect(captured.locationToken).toBeNull();
  });
});

describe('server outranks the bundled client list', () => {
  it('server says NOT legal → blocked even though client list says legal', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ legal: false }),
    });
    await renderGate();
    await act(async () => captured.submitManualState('IL'));
    expect(captured.status).toBe('blocked');
    expect(captured.locationToken).toBeNull();
  });

  it('server responds ok but with no token → NOT allowed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ legal: true }), // malformed: no token
    });
    await renderGate();
    await act(async () => captured.submitManualState('IL'));
    expect(captured.status).not.toBe('allowed');
    expect(captured.locationToken).toBeNull();
  });

  it('network failure requesting the token → unverified (fail closed), never allowed', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    await renderGate();
    await act(async () => captured.submitManualState('IL'));
    expect(captured.status).toBe('unverified');
    expect(captured.locationToken).toBeNull();
  });

  it('server 500 → unverified, no token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await renderGate();
    await act(async () => captured.submitManualState('IL'));
    expect(captured.status).toBe('unverified');
    expect(captured.locationToken).toBeNull();
  });
});

describe('TTL re-check on focus (ensureFresh)', () => {
  it('re-runs verification after the 30-min TTL, not before', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-13T12:00:00Z'));
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });
    mockGetPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    mockReverseGeocode.mockResolvedValue([{ region: 'Colorado' }]);
    serverGrantsToken();
    await renderGate();

    // First focus: idle → verifies.
    await act(async () => {
      captured.ensureFresh();
    });
    expect(captured.status).toBe('allowed');
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);

    // Focus again 5 minutes later: fresh, no re-check.
    jest.setSystemTime(new Date('2026-08-13T12:05:00Z'));
    await act(async () => {
      captured.ensureFresh();
    });
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);

    // Focus 31 minutes after the original check: stale → re-verifies.
    jest.setSystemTime(new Date('2026-08-13T12:31:00Z'));
    serverGrantsToken('tok-refresh');
    await act(async () => {
      captured.ensureFresh();
    });
    expect(mockRequestPermissions).toHaveBeenCalledTimes(2);
    expect(captured.locationToken).toBe('tok-refresh');
  });

  it('a FAILED check is also timestamped — no immediate retry loop', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-13T12:00:00Z'));
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });
    await renderGate();

    await act(async () => {
      captured.ensureFresh();
    });
    expect(captured.status).toBe('unverified');
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);

    // Immediate re-focus must NOT retry (would loop the permission prompt).
    await act(async () => {
      captured.ensureFresh();
    });
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });
});

describe('invariant: allowed always implies a token in hand', () => {
  it('no tested path ever yields allowed with a null token', async () => {
    // Re-assert across a mixed sequence: blocked → allowed → server-refused.
    await renderGate();

    await act(async () => captured.submitManualState('TX'));
    expect(captured.status === 'allowed' && !captured.locationToken).toBe(false);

    serverGrantsToken('tok-1');
    await act(async () => captured.submitManualState('NY'));
    expect(captured.status).toBe('allowed');
    expect(captured.locationToken).toBe('tok-1');

    // A later refused verification must clear the stale token, not keep it.
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ legal: false }) });
    await act(async () => captured.submitManualState('IL'));
    expect(captured.status).toBe('blocked');
    expect(captured.locationToken).toBeNull();
  });
});
