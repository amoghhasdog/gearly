import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { CropBox, SpeedReading } from '../types/speed';

/**
 * SpeedReader: crops a captured camera photo to the calibration crop box,
 * runs OCR on the cropped region only, and parses a numeric speed out of the
 * recognized text.
 */

// ---------------------------------------------------------------------------
// OCR engine abstraction
// ---------------------------------------------------------------------------

export interface OcrResult {
  text: string;
  /** 0..1 if the engine reports it (ML Kit on RN does not). */
  confidence?: number;
}

export interface OcrEngine {
  readonly name: string;
  isAvailable(): boolean;
  recognize(imageUri: string): Promise<OcrResult>;
}

/**
 * ML Kit on-device text recognition (@react-native-ml-kit/text-recognition).
 *
 * Requires a development build (`npx expo prebuild` / EAS build) because it is
 * a native module — it is NOT available inside Expo Go. When the native module
 * is missing we degrade gracefully: `isAvailable()` turns false and every read
 * comes back as 'no_text', keeping the rest of the app usable.
 */
export class MlKitOcrEngine implements OcrEngine {
  readonly name = 'ML Kit (on-device)';
  private module: { recognize(url: string): Promise<{ text: string }> } | null = null;
  private failed = false;

  constructor() {
    try {
      // Dynamic require so a missing/broken native module can't crash startup.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.module = require('@react-native-ml-kit/text-recognition').default ?? null;
    } catch {
      this.module = null;
    }
  }

  isAvailable(): boolean {
    return this.module != null && !this.failed;
  }

  async recognize(imageUri: string): Promise<OcrResult> {
    if (!this.module) throw new Error('ML Kit text recognition module not installed');
    try {
      const result = await this.module.recognize(imageUri);
      return { text: result?.text ?? '' };
    } catch (e) {
      // Native call failed (e.g. running in Expo Go). Mark unavailable so the
      // debug panel can explain why, instead of erroring every 500 ms.
      this.failed = true;
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Crop-box mapping: normalized preview coords -> photo pixel coords
// ---------------------------------------------------------------------------

export interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Map a crop box (normalized 0..1 relative to the on-screen preview) onto the
 * captured photo's pixel grid.
 *
 * The preview renders the camera feed with "cover" scaling: the photo is
 * scaled to fill the preview and the overflow is cropped symmetrically. We
 * invert that transform here. On iOS, expo-camera scales photos to match the
 * preview, so the aspect ratios usually agree and the offsets are ~0 — but the
 * general math keeps this correct if they differ (and later on Android).
 */
export function mapCropBoxToPhotoRegion(
  cropBox: CropBox,
  preview: { width: number; height: number },
  photo: { width: number; height: number }
): PixelRegion {
  const scale = Math.max(preview.width / photo.width, preview.height / photo.height);
  const offsetX = (photo.width * scale - preview.width) / 2;
  const offsetY = (photo.height * scale - preview.height) / 2;

  let x = (cropBox.x * preview.width + offsetX) / scale;
  let y = (cropBox.y * preview.height + offsetY) / scale;
  let width = (cropBox.width * preview.width) / scale;
  let height = (cropBox.height * preview.height) / scale;

  // Clamp to the photo bounds and enforce a minimum usable size.
  x = Math.max(0, Math.min(x, photo.width - 8));
  y = Math.max(0, Math.min(y, photo.height - 8));
  width = Math.max(8, Math.min(width, photo.width - x));
  height = Math.max(8, Math.min(height, photo.height - y));

  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

// ---------------------------------------------------------------------------
// Text -> speed parsing
// ---------------------------------------------------------------------------

/**
 * Common OCR misreads on digital dashboards. We only apply these to tokens
 * that already contain at least one real digit, so plain words never turn
 * into phantom speeds (avoids overcorrecting).
 */
const CHAR_FIXES: Record<string, string> = {
  O: '0',
  o: '0',
  I: '1',
  i: '1',
  l: '1',
  '|': '1',
  S: '5',
  s: '5',
  B: '8',
};

interface Candidate {
  value: number;
  corrected: boolean;
  digitCount: number;
}

/**
 * Extract the most likely speed (1-3 digits) from raw OCR text.
 * If several numbers are present, prefer clean (uncorrected) tokens, then the
 * one closest to the previous known speed.
 */
export function parseSpeedFromText(rawText: string, previousSpeedMph?: number | null): number | null {
  const tokens = rawText.split(/[^0-9A-Za-z|]+/).filter(Boolean);
  const candidates: Candidate[] = [];

  for (const token of tokens) {
    if (token.length < 1 || token.length > 3) continue;

    if (/^\d{1,3}$/.test(token)) {
      candidates.push({ value: parseInt(token, 10), corrected: false, digitCount: token.length });
      continue;
    }

    const digitCount = (token.match(/\d/g) ?? []).length;
    if (digitCount === 0) continue; // pure letters — do not invent a number
    const fixed = token
      .split('')
      .map((c) => CHAR_FIXES[c] ?? c)
      .join('');
    if (/^\d{1,3}$/.test(fixed)) {
      candidates.push({ value: parseInt(fixed, 10), corrected: true, digitCount });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    // Clean digits beat corrected ones.
    if (a.corrected !== b.corrected) return a.corrected ? 1 : -1;
    // Closest to the previous speed wins — the speed number changes slowly.
    if (previousSpeedMph != null) {
      return Math.abs(a.value - previousSpeedMph) - Math.abs(b.value - previousSpeedMph);
    }
    // Otherwise prefer the token with more real digits (the big speed digits
    // OCR better than surrounding UI cruft).
    return b.digitCount - a.digitCount;
  });

  return candidates[0].value;
}

// ---------------------------------------------------------------------------
// SpeedReader
// ---------------------------------------------------------------------------

export interface ReadSpeedParams {
  photoUri: string;
  photoWidth: number;
  photoHeight: number;
  previewWidth: number;
  previewHeight: number;
  cropBox: CropBox;
  /** Previous filtered speed in the *same unit the screen displays* (helps pick between candidates). */
  previousDisplayedSpeed?: number | null;
}

export class SpeedReader {
  private engine: OcrEngine;
  private lastErrorMessage: string | null = null;

  constructor(engine?: OcrEngine) {
    this.engine = engine ?? new MlKitOcrEngine();
  }

  get ocrEngineName(): string {
    return this.engine.name;
  }

  get ocrAvailable(): boolean {
    return this.engine.isAvailable();
  }

  get lastError(): string | null {
    return this.lastErrorMessage;
  }

  async readSpeed(params: ReadSpeedParams): Promise<SpeedReading> {
    const timestamp = Date.now();

    try {
      const region = mapCropBoxToPhotoRegion(
        params.cropBox,
        { width: params.previewWidth, height: params.previewHeight },
        { width: params.photoWidth, height: params.photoHeight }
      );

      // Crop to just the speed number — OCR on the whole Tesla screen is slow
      // and noisy (gear indicator, clock, temperature all look like numbers).
      const context = ImageManipulator.manipulate(params.photoUri);
      context.crop({ originX: region.x, originY: region.y, width: region.width, height: region.height });
      // Upscale small crops: ML Kit is much more reliable with larger glyphs.
      if (region.width < 320) {
        context.resize({ width: 320, height: null });
      }
      // TODO(preprocessing): grayscale, contrast boost, thresholding and
      // sharpening would materially improve OCR under glare / low brightness.
      // expo-image-manipulator can't do those; revisit with a GL shader or a
      // small native/wasm preprocessing step.
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
      tryRelease(image);
      tryRelease(context);

      const ocr = await this.engine.recognize(saved.uri);
      this.lastErrorMessage = null;

      const rawText = (ocr.text ?? '').trim();
      if (rawText.length === 0) {
        return { rawText, parsedSpeed: null, confidence: ocr.confidence, timestamp, status: 'no_text' };
      }

      const parsed = parseSpeedFromText(rawText, params.previousDisplayedSpeed);
      if (parsed == null) {
        return { rawText, parsedSpeed: null, confidence: ocr.confidence, timestamp, status: 'invalid' };
      }

      const status = ocr.confidence != null && ocr.confidence < 0.5 ? 'low_confidence' : 'valid';
      return { rawText, parsedSpeed: parsed, confidence: ocr.confidence, timestamp, status };
    } catch (e) {
      this.lastErrorMessage = e instanceof Error ? e.message : String(e);
      return { rawText: '', parsedSpeed: null, timestamp, status: 'no_text' };
    }
  }
}

/** Free a native shared object if the runtime supports it; never throw. */
function tryRelease(obj: unknown): void {
  try {
    (obj as { release?: () => void }).release?.();
  } catch {
    // best effort
  }
}
