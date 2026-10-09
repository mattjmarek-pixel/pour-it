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
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  FlatList: ({ data, renderItem }: {
    data: { abbr: string }[];
    renderItem: (info: { item: { abbr: string } }) => React.ReactNode;
  }) => data.map((item) =>
    require('react').createElement(require('react').Fragment, { key: item.abbr }, renderItem({ item }))
  ),
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
}));

jest.mock('@expo/vector-icons', () => ({ Feather: 'Feather' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

const mockFetch = jest.fn();
(global as { fetch?: unknown }).fetch = mockFetch;

process.env.EXPO_PUBLIC_DOMAIN = 'test.example.com';

import { ThcGateProvider, useThcGate } from '../../context/ThcGateContext';
import type { ThcGateStatus } from '../../context/ThcGateContext';
import { ThcGate } from '../../components/ThcGate';

// ---- harness ----

interface Captured {
  status: ThcGateStatus;
  selfReported: boolean;
  stateAbbr: string | null;
  locationToken: string | null;
  verifyLocation: () => Promise<void>;
  ensureFresh: () => void;
  submitManualState: (abbr: string) => Promise<void>;
}

let captured: Captured;
let mounted: ReactTestRenderer[] = [];

// React 19 requires this flag for async act in a non-DOM test environment.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe() {
  captured = useThcGate() as unknown as Captured;
  return null;
}

async function renderGate(content?: React.ReactNode): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      React.createElement(ThcGateProvider, null, React.createElement(Probe), content)
    );
  });
  mounted.push(renderer);
  return renderer;
}

function serverGrantsToken(token = 'signed-token-abc') {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ legal: true, locationToken: token }),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPlatformOS = 'ios';
});

afterEach(async () => {
  await act(async () => {
    mounted.forEach((renderer) => renderer.unmount());
  });
  mounted = [];
  jest.useRealTimers();
});

// ---- tests ----

describe('GPS verification failure paths (fail closed)', () => {
  it.each(['permission', 'position'])('%s API rejection offers manual fallback', async (step) => {
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });
    if (step === 'permission') mockRequestPermissions.mockRejectedValue(new Error('unavailable'));
    else mockGetPosition.mockRejectedValue(new Error('GPS unavailable'));
    await renderGate();
    await act(async () => captured.verifyLocation());
    expect(captured.status).toBe('unverified');
    expect(captured.locationToken).toBeNull();
    expect(mockReverseGeocode).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

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
  it('self-report expires after 30 minutes and GPS replaces it with a blocked state', async () => {
    jest.useFakeTimers();
    const start = new Date('2026-10-09T12:00:00Z').getTime();
    jest.setSystemTime(start);
    serverGrantsToken('manual-token');
    await renderGate();
    await act(async () => captured.submitManualState(' california '));
    expect(captured.status).toBe('allowed');
    expect(captured.stateAbbr).toBe('CA');
    expect(captured.selfReported).toBe(true);

    // The existing contract is strictly greater than 30 minutes.
    for (const elapsed of [30 * 60 * 1000 - 1, 30 * 60 * 1000]) {
      jest.setSystemTime(start + elapsed);
      await act(async () => captured.ensureFresh());
      expect(mockRequestPermissions).not.toHaveBeenCalled();
      expect(captured.locationToken).toBe('manual-token');
    }

    mockRequestPermissions.mockResolvedValue({ status: 'granted' });
    mockGetPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    mockReverseGeocode.mockResolvedValue([{ region: 'Texas' }]);
    jest.setSystemTime(start + 30 * 60 * 1000 + 1);
    await act(async () => captured.ensureFresh());
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(captured.status).toBe('blocked');
    expect(captured.stateAbbr).toBe('TX');
    expect(captured.selfReported).toBe(false);
    expect(captured.locationToken).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

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

describe('session and in-flight transitions', () => {
  it('starts idle, exposes checking, deduplicates GPS checks, then allows', async () => {
    let resolvePermission!: (value: { status: string }) => void;
    mockRequestPermissions.mockReturnValue(new Promise((resolve) => {
      resolvePermission = resolve;
    }));
    mockGetPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    mockReverseGeocode.mockResolvedValue([{ region: 'ca' }]);
    serverGrantsToken();
    await renderGate();
    expect(captured.status).toBe('idle');
    expect(captured.stateAbbr).toBeNull();
    expect(captured.locationToken).toBeNull();
    expect(captured.selfReported).toBe(false);
    const ensureFresh = captured.ensureFresh;
    let pending!: Promise<void>;
    await act(async () => { pending = captured.verifyLocation(); });
    expect(captured.status).toBe('checking');
    await act(async () => {
      captured.ensureFresh();
      await captured.verifyLocation();
    });
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolvePermission({ status: 'granted' });
      await pending;
    });
    expect(captured.status).toBe('allowed');
    expect(captured.selfReported).toBe(false);
    expect(captured.ensureFresh).toBe(ensureFresh);
  });

  it('does not carry a manual verification into a new provider session', async () => {
    serverGrantsToken();
    const first = await renderGate();
    await act(async () => captured.submitManualState('CA'));
    expect(captured.status).toBe('allowed');
    await act(async () => first.unmount());
    mounted = mounted.filter((renderer) => renderer !== first);
    await renderGate();
    expect(captured.status).toBe('idle');
    expect(captured.locationToken).toBeNull();
    expect(captured.selfReported).toBe(false);
  });
});

describe('THC gate screen and manual picker wiring', () => {
  const scan = jest.fn();
  const content = () => React.createElement(
    ThcGate, null,
    React.createElement('Pressable', { testID: 'thc-scan', onPress: scan }, 'Scan THC')
  );
  const scanButtons = (renderer: ReactTestRenderer) =>
    renderer.root.findAllByProps({ testID: 'thc-scan' });
  async function press(renderer: ReactTestRenderer, label: string) {
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: label }).props.onPress();
    });
  }
  function expectText(renderer: ReactTestRenderer, text: string) {
    expect(JSON.stringify(renderer.toJSON())).toContain(text);
  }

  it('denied permission exposes manual selection; an illegal selection blocks scanning', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });
    const renderer = await renderGate(content());
    expectText(renderer, 'Location needed for THC features');
    expect(scanButtons(renderer)).toHaveLength(0);
    await press(renderer, 'Select state manually');
    expectText(renderer, 'Select your state');
    expect(scanButtons(renderer)).toHaveLength(0);
    await press(renderer, 'Select Texas');
    expectText(renderer, 'THC recognition isn’t available in your state');
    expectText(renderer, 'THC scanning and recipes are disabled here.');
    expect(scanButtons(renderer)).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
  });

  it('keeps children unmounted while checking and reveals them only after token approval', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });
    const renderer = await renderGate(content());
    await press(renderer, 'Select state manually');
    let resolveResponse!: (response: unknown) => void;
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { resolveResponse = resolve; }));
    await press(renderer, 'Select California');
    expectText(renderer, 'Verifying your location…');
    expect(scanButtons(renderer)).toHaveLength(0);
    await act(async () => {
      resolveResponse({ ok: true, json: async () => ({ legal: true, locationToken: 'signed-ca' }) });
    });
    expect(captured.locationToken).toBe('signed-ca');
    expect(scanButtons(renderer)).toHaveLength(1);
    await act(async () => scanButtons(renderer)[0].props.onPress());
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('does not reveal THC children when a legal selection gets no server token', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ legal: true }) });
    const renderer = await renderGate(content());
    await press(renderer, 'Select state manually');
    await press(renderer, 'Select California');
    expectText(renderer, 'THC recognition isn’t available in your state');
    expect(scanButtons(renderer)).toHaveLength(0);
    expect(scan).not.toHaveBeenCalled();
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
