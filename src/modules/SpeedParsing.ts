import { CropBox } from '../types/speed';

/**
 * Pure parsing/geometry helpers for SpeedReader. No React Native or Expo
 * imports here — this module also runs in plain Node (tests, replay harness).
 */

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
