import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockPermission = jest.fn();
const mockPosition = jest.fn();
const mockGeocode = jest.fn();
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => mockPermission(),
  getCurrentPositionAsync: () => mockPosition(),
  reverseGeocodeAsync: () => mockGeocode(),
  Accuracy: { Balanced: 3 },
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  View: 'View', Text: 'Text', Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles },
  FlatList: ({ data, renderItem }: any) =>
    data.map((item: any) => React.createElement(
      React.Fragment, { key: item.abbr }, renderItem({ item }))),
}));
jest.mock('@expo/vector-icons', () => ({ Feather: 'Feather' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// Focus events are explicitly driven through ensureFresh in these tests.
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

import { ThcGateProvider, useThcGate } from '../../context/ThcGateContext';
import { ThcGate } from '../../components/ThcGate';

let gate: ReturnType<typeof useThcGate>;
let tree: ReactTestRenderer;
const originalFetch = global.fetch;
const originalDomain = process.env.EXPO_PUBLIC_DOMAIN;
const mockFetch = jest.fn();
function Probe() {
  gate = useThcGate();
  return React.createElement(ThcGate, null,
    React.createElement('THCProtectedContent'));
}
const protectedContent = () => tree.root.findAllByType('THCProtectedContent' as any);
const button = (label: string) => tree.root.findAllByProps({
  accessibilityLabel: label,
}).find(node => node.type === ('Pressable' as any))!;
async function mount() {
  await act(async () => {
    tree = create(React.createElement(ThcGateProvider, null, React.createElement(Probe)));
  });
}
beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-09T12:00:00Z'));
  process.env.EXPO_PUBLIC_DOMAIN = 'test.example.com';
  global.fetch = mockFetch;
  mockPermission.mockResolvedValue({ status: 'granted' });
  mockPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
  mockGeocode.mockResolvedValue([{ region: 'California' }]);
  mockFetch.mockResolvedValue({
    ok: true, json: async () => ({ legal: true, locationToken: 'test-only-token' }),
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  jest.useRealTimers();
  global.fetch = originalFetch;
  if (originalDomain === undefined) delete process.env.EXPO_PUBLIC_DOMAIN;
  else process.env.EXPO_PUBLIC_DOMAIN = originalDomain;
});

it('permission denied keeps THC content blocked', async () => {
  mockPermission.mockResolvedValue({ status: 'denied' });
  await mount();
  await act(async () => gate.verifyLocation());
  expect(gate.status).toBe('unverified');
  expect(gate.locationToken).toBeNull();
  expect(protectedContent()).toHaveLength(0);
  expect(mockPosition).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

it('geocode failure opens a usable manual state picker', async () => {
  mockGeocode.mockRejectedValue(new Error('Geocoder unavailable'));
  await mount();
  await act(async () => gate.verifyLocation());
  expect(gate.status).toBe('unverified');
  expect(protectedContent()).toHaveLength(0);
  await act(async () => button('Select state manually').props.onPress());
  expect(button('Select California')).toBeDefined();
  await act(async () => button('Select California').props.onPress());
  expect(gate.selfReported).toBe(true);
  expect(gate.status).toBe('allowed');
  expect(protectedContent()).toHaveLength(1);
});

it('unknown GPS state never exposes THC content', async () => {
  mockGeocode.mockResolvedValue([{ region: 'Atlantis' }]);
  await mount();
  await act(async () => gate.verifyLocation());
  expect(gate.status).toBe('unverified');
  expect(gate.locationToken).toBeNull();
  expect(protectedContent()).toHaveLength(0);
  expect(mockFetch).not.toHaveBeenCalled();
});

it('30-minute re-check runs on focus immediately after TTL expiry', async () => {
  await mount();
  await act(async () => gate.ensureFresh());
  expect(gate.status).toBe('allowed');
  jest.advanceTimersByTime(30 * 60 * 1000);
  await act(async () => gate.ensureFresh());
  expect(mockPermission).toHaveBeenCalledTimes(1);
  mockPermission.mockResolvedValue({ status: 'denied' });
  jest.advanceTimersByTime(1);
  await act(async () => gate.ensureFresh());
  expect(mockPermission).toHaveBeenCalledTimes(2);
  expect(gate.status).toBe('unverified');
  expect(protectedContent()).toHaveLength(0);
});

it('manual non-legal state keeps THC content blocked', async () => {
  await mount();
  await act(async () => gate.submitManualState('TX'));
  expect(gate.status).toBe('blocked');
  expect(gate.locationToken).toBeNull();
  expect(protectedContent()).toHaveLength(0);
  expect(mockFetch).not.toHaveBeenCalled();
});

it('manual legal state exposes THC only after server confirmation', async () => {
  let resolve!: (response: any) => void;
  mockFetch.mockReturnValue(new Promise(done => { resolve = done; }));
  await mount();
  let pending!: Promise<void>;
  await act(async () => { pending = gate.submitManualState('CA'); });
  expect(gate.status).toBe('checking');
  expect(protectedContent()).toHaveLength(0);
  await act(async () => {
    resolve({ ok: true, json: async () => ({ legal: true, locationToken: 'confirmed' }) });
    await pending;
  });
  expect(gate.status).toBe('allowed');
  expect(gate.locationToken).toBe('confirmed');
  expect(protectedContent()).toHaveLength(1);
});
