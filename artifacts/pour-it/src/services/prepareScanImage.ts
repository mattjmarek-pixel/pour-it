import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_SIDE = 1568;
// Base64 is ASCII: its string length is its byte size. Use decimal MB
// conservatively, leaving room below the API and provider image limits.
const MAX_BASE64_BYTES = 4_500_000;

export async function prepareScanImage(photo: {
  uri: string;
  width: number;
  height: number;
}): Promise<string> {
  if (!photo.uri || !Number.isFinite(photo.width) || !Number.isFinite(photo.height) ||
      photo.width <= 0 || photo.height <= 0) {
    throw new Error('Invalid scan image');
  }
  const context = ImageManipulator.manipulate(photo.uri);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    const longest = Math.max(photo.width, photo.height);
    if (longest > MAX_SIDE) {
      // A single dimension lets the native encoder preserve the aspect ratio.
      context.resize(photo.width >= photo.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    }
    rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.7,
      base64: true,
    });
    if (!result.base64 || result.base64.length > MAX_BASE64_BYTES ||
        !Number.isFinite(result.width) || !Number.isFinite(result.height) ||
        result.width <= 0 || result.height <= 0 ||
        Math.max(result.width, result.height) > MAX_SIDE) {
      throw new Error('Scan image exceeds upload limits or is invalid');
    }
    return result.base64;
  } finally {
    rendered?.release();
    context.release();
  }
}
