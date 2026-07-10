import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { CropBox, SpeedReading } from '../types/speed';
import { mapCropBoxToPhotoRegion, parseSpeedFromText } from './SpeedParsing';

// Pure helpers live in SpeedParsing.ts (no native imports → usable in Node
// tests/replays); re-exported here so existing imports keep working.
export { mapCropBoxToPhotoRegion, parseSpeedFromText } from './SpeedParsing';
export type { PixelRegion } from './SpeedParsing';

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
