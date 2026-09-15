import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockTakePicture = jest.fn();
const mockFetch = jest.fn();
const mockOnProductFound = jest.fn();
const mockCameraProps: { onBarcodeScanned?: (result: { data: string }) => void } = {};
const mockQuotaProps: { issue?: string } = {};
const mockPermission = { granted: true, canAskAgain: false };
const storage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    storage.set(key, value);
    return Promise.resolve();
  }),
}));

jest.mock('react-native', () => {
  const ReactModule = require('react');
  const Host = ({ children, ...props }: { children?: React.ReactNode }) =>
    ReactModule.createElement('native-host', props, children);
  const AnimatedHost = ({ children, ...props }: { children?: React.ReactNode }) =>
    ReactModule.createElement('animated-host', props, children);
  return {
    ActivityIndicator: Host,
    Animated: {
      Value: jest.fn(() => ({})),
      View: AnimatedHost,
      loop: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
      sequence: jest.fn(() => []),
      timing: jest.fn(() => ({ start: jest.fn() })),
    },
    Linking: { openSettings: jest.fn() },
    Platform: { OS: 'ios' },
    Pressable: Host,
    StyleSheet: {
      absoluteFill: {},
      create: (styles: unknown) => styles,
    },
    Text: Host,
    View: Host,
  };
});

jest.mock('expo-camera', () => {
  const ReactModule = require('react');
  return {
    CameraView: ReactModule.forwardRef(
      (
        props: { onBarcodeScanned?: (result: { data: string }) => void },
        ref: React.Ref<unknown>
      ) => {
        Object.assign(mockCameraProps, props);
        ReactModule.useImperativeHandle(ref, () => ({
          takePictureAsync: mockTakePicture,
        }));
        return ReactModule.createElement('camera-view');
      }
    ),
    useCameraPermissions: () => [mockPermission, jest.fn()],
  };
});

jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => true }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/context/ThcGateContext', () => ({
  useThcGate: () => ({ locationToken: null }),
}));
jest.mock('@/components/CrossCategoryWarningModal', () => ({
  CrossCategoryWarningModal: () => null,
}));
jest.mock('@/components/EmptyState', () => ({ EmptyState: () => null }));
jest.mock('@/components/ScanToast', () => ({ ScanToast: () => null }));
jest.mock('@/components/AIVisionQuotaModal', () => ({
  AIVisionQuotaModal: (props: { issue?: string }) => {
    Object.assign(mockQuotaProps, props);
    return null;
  },
}));
jest.mock('@/src/services/mixerFlow', () => ({
  buildFullCatalogHints: () => [],
}));
jest.mock('@/src/services/myBarStorage', () => ({
  upsertMyBarProduct: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/utils/haptics', () => ({
  safeNotification: jest.fn(),
}));

process.env.EXPO_PUBLIC_DOMAIN = 'test.example.com';

import { ScanView } from '@/components/ScanView';
import { __resetVisionUsageStateForTests } from '@/src/services/scanUsage';

async function flushScan(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function renderScanner(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      React.createElement(ScanView, {
        mode: 'spirits',
        accentColor: '#D4A843',
        onProductFound: mockOnProductFound,
        onBrowseManually: jest.fn(),
      })
    );
  });
  return renderer;
}

describe('ScanView AI allowance integration', () => {
  beforeEach(() => {
    storage.clear();
    jest.clearAllMocks();
    mockTakePicture.mockReset();
    mockFetch.mockReset();
    mockOnProductFound.mockReset();
    (AsyncStorage.getItem as jest.Mock)
      .mockReset()
      .mockImplementation((key: string) => Promise.resolve(storage.get(key) ?? null));
    (AsyncStorage.setItem as jest.Mock)
      .mockReset()
      .mockImplementation((key: string, value: string) => {
        storage.set(key, value);
        return Promise.resolve();
      });
    delete process.env.EXPO_PUBLIC_AI_VISION_REVIEWER_BYPASS;
    __resetVisionUsageStateForTests();
    delete mockCameraProps.onBarcodeScanned;
    delete mockQuotaProps.issue;
  });

  it('blocks an unknown-barcode fallback at zero allowance before capture', async () => {
    storage.set('ai_vision_usage:v1', '3');
    const renderer = await renderScanner();

    await act(async () => {
      mockCameraProps.onBarcodeScanned?.({ data: 'unknown-barcode' });
    });
    await flushScan();

    expect(mockTakePicture).not.toHaveBeenCalled();
    expect(mockQuotaProps.issue).toBe('exhausted');
    await act(async () => renderer.unmount());
  });

  it('does not capture when allowance resolution completes after unmount', async () => {
    const allowanceRead = deferred<string | null>();
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(
      () => allowanceRead.promise
    );
    const renderer = await renderScanner();

    await act(async () => {
      mockCameraProps.onBarcodeScanned?.({ data: 'unknown-barcode' });
      await Promise.resolve();
    });
    await act(async () => renderer.unmount());
    allowanceRead.resolve(null);
    await flushScan();

    expect(mockTakePicture).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockOnProductFound).not.toHaveBeenCalled();
  });

  it('does not send or callback when capture resolves after unmount', async () => {
    const capture = deferred<{ base64: string }>();
    mockTakePicture.mockReturnValueOnce(capture.promise);
    const renderer = await renderScanner();

    await act(async () => {
      mockCameraProps.onBarcodeScanned?.({ data: 'unknown-barcode' });
      await Promise.resolve();
    });
    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
    capture.resolve({ base64: 'captured-image' });
    await flushScan();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockOnProductFound).not.toHaveBeenCalled();
  });

  it('does not commit or callback when the response resolves after unmount', async () => {
    mockTakePicture.mockResolvedValueOnce({ base64: 'captured-image' });
    const response = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    mockFetch.mockReturnValueOnce(response.promise);
    (global as { fetch?: unknown }).fetch = mockFetch;
    const renderer = await renderScanner();

    await act(async () => {
      mockCameraProps.onBarcodeScanned?.({ data: 'unknown-barcode' });
      await Promise.resolve();
    });
    await flushScan();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
    response.resolve({
      ok: true,
      json: async () => ({
        status: 'ai',
        product: { name: 'Late', brand: 'Brand', category: 'mixer', recipes: [] },
        verificationToken: 'late-token',
      }),
    });
    await flushScan();

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(mockOnProductFound).not.toHaveBeenCalled();
  });

  it('does not forward a product when the allowance commit write fails', async () => {
    mockTakePicture.mockResolvedValueOnce({ base64: 'captured-image' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ai',
        product: { name: 'Unpersisted', brand: 'Brand', category: 'mixer', recipes: [] },
        verificationToken: 'write-fail-token',
      }),
    });
    (global as { fetch?: unknown }).fetch = mockFetch;
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    const renderer = await renderScanner();

    await act(async () => {
      mockCameraProps.onBarcodeScanned?.({ data: 'unknown-barcode' });
    });
    await flushScan();

    expect(mockOnProductFound).not.toHaveBeenCalled();
    expect(mockQuotaProps.issue).toBe('unknown');
    await act(async () => renderer.unmount());
  });

  it('keeps known barcode success free of allowance reads and writes', async () => {
    const renderer = await renderScanner();

    await act(async () => {
      mockCameraProps.onBarcodeScanned?.({ data: '0080432402481' });
    });
    await flushScan();

    expect(mockOnProductFound).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(mockTakePicture).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('charges a successful unknown-barcode AI fallback and forwards the product', async () => {
    mockTakePicture.mockResolvedValueOnce({ base64: 'captured-image' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ai',
        product: {
          name: 'AI Tonic',
          brand: 'AI Brand',
          category: 'mixer',
          recipes: [],
        },
        verificationToken: 'verified-token',
      }),
    });
    (global as { fetch?: unknown }).fetch = mockFetch;
    const renderer = await renderScanner();

    await act(async () => {
      mockCameraProps.onBarcodeScanned?.({ data: 'unknown-barcode' });
    });
    await flushScan();

    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    expect(mockOnProductFound).toHaveBeenCalledTimes(1);
    expect(storage.get('ai_vision_usage:v1')).toBe('1');
    await act(async () => renderer.unmount());
  });

  it('releases the reservation when the fallback is uncertain', async () => {
    mockTakePicture.mockResolvedValueOnce({ base64: 'captured-image' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'uncertain' }),
    });
    (global as { fetch?: unknown }).fetch = mockFetch;
    const renderer = await renderScanner();

    await act(async () => {
      mockCameraProps.onBarcodeScanned?.({ data: 'unknown-barcode' });
    });
    await flushScan();

    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    expect(mockOnProductFound).not.toHaveBeenCalled();
    expect(storage.has('ai_vision_usage:v1')).toBe(false);
    await act(async () => renderer.unmount());
  });
});