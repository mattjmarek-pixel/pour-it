import { prepareScanImage } from '../services/prepareScanImage';

const mockResize = jest.fn();
const mockSave = jest.fn();
const mockReleaseImage = jest.fn();
const mockReleaseContext = jest.fn();
const mockRender = jest.fn();
const mockManipulate = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) },
  SaveFormat: { JPEG: 'jpeg' },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockManipulate.mockReturnValue({
    resize: mockResize, renderAsync: mockRender, release: mockReleaseContext,
  });
  mockRender.mockResolvedValue({ saveAsync: mockSave, release: mockReleaseImage });
  mockSave.mockResolvedValue({ width: 1568, height: 1176, base64: 'jpeg-output' });
});

it.each([
  [4032, 3024, { width: 1568 }],
  [3024, 4032, { height: 1568 }],
  [4000, 4000, { width: 1568 }],
])('resizes large %s x %s images to a maximum longest side of 1568', async (width, height, resize) => {
  await expect(prepareScanImage({ uri: 'file:///bottle.jpg', width, height })).resolves.toBe('jpeg-output');
  expect(mockResize).toHaveBeenCalledWith(resize);
  expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.7, base64: true });
  expect(mockReleaseImage).toHaveBeenCalledTimes(1);
  expect(mockReleaseContext).toHaveBeenCalledTimes(1);
});

it.each([[640, 480], [480, 640], [1568, 1176]])('does not upscale %s x %s images, but still encodes JPEG', async (width, height) => {
  mockSave.mockResolvedValueOnce({ width, height, base64: 'small-jpeg' });
  await prepareScanImage({ uri: 'file:///small.png', width, height });
  expect(mockResize).not.toHaveBeenCalled();
  expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.7, base64: true });
});

it('rejects resize failures instead of returning the original image', async () => {
  mockRender.mockRejectedValueOnce(new Error('Native resize failed'));
  await expect(prepareScanImage({ uri: 'file:///original.jpg', width: 4032, height: 3024 }))
    .rejects.toThrow('Native resize failed');
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockReleaseContext).toHaveBeenCalledTimes(1);
});

it('blocks a base64 result over 4.5 MB', async () => {
  mockSave.mockResolvedValueOnce({ width: 1568, height: 1176, base64: 'A'.repeat(4_500_001) });
  await expect(prepareScanImage({ uri: 'file:///bottle.jpg', width: 4032, height: 3024 })).rejects.toThrow('upload limits');
});

it('accepts exactly 4.5 MB of base64', async () => {
  mockSave.mockResolvedValueOnce({ width: 1568, height: 1176, base64: 'A'.repeat(4_500_000) });
  expect((await prepareScanImage({ uri: 'file:///bottle.jpg', width: 4032, height: 3024 })).length).toBe(4_500_000);
});

it('blocks an encoder result that still exceeds the dimension limit', async () => {
  mockSave.mockResolvedValueOnce({ width: 4032, height: 3024, base64: 'jpeg' });
  await expect(prepareScanImage({ uri: 'file:///bottle.jpg', width: 4032, height: 3024 })).rejects.toThrow('upload limits');
});

it('blocks missing base64', async () => {
  mockSave.mockResolvedValueOnce({ width: 1568, height: 1176 });
  await expect(prepareScanImage({ uri: 'file:///bottle.jpg', width: 4032, height: 3024 })).rejects.toThrow();
});

it('rejects invalid input dimensions before decoding', async () => {
  await expect(prepareScanImage({ uri: 'file:///bottle.jpg', width: NaN, height: 3024 })).rejects.toThrow();
  expect(mockManipulate).not.toHaveBeenCalled();
});
