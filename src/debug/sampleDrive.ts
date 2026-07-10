/**
 * A real recorded drive: filtered speeds (mph, one sample per 0.5 s) from a
 * Tesla Model 3 screen recording (clip IMG_5836) replayed through the app's
 * OCR + SpeedFilter pipeline. 0 → 54 mph highway pull, coast back down.
 * Used by the debug "Replay recorded drive" feature to exercise the engine
 * simulator + audio without a car or working OCR.
 */
export const SAMPLE_DRIVE_INTERVAL_MS = 500;

export const SAMPLE_DRIVE_MPH: number[] = [
  0, 0, 0, 0, 0, 0, 0, 0.4, 1.4, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 7.1, 10.6, 10.6, 10.6, 10.6,
  10.6, 22.8, 22.8, 34.5, 34.5, 34.5, 34.5, 41.1, 44.3, 45, 45, 45, 48.2, 50.5, 50.5, 50.7,
  49.6, 48.2, 46.1, 43.7, 41, 39, 37, 37, 34.2, 32.1, 31.3, 32.4, 32.4, 32.4, 32.4, 32.4,
  37.8, 40.3, 40.6, 39.9, 39.9, 38, 36, 34, 32, 30.4, 29.4, 28.5, 27.1, 25.8, 24.7, 23.6,
  22.6, 21.1, 19.5, 18.1, 16.9, 16.9, 11.3, 11.3, 11.3, 9.6, 7.8, 7.8, 5.5, 3.7, 3.7, 2, 1, 0,
];

/** Linear interpolation into the drive at time t (ms since replay start). */
export function sampleDriveSpeedAt(elapsedMs: number): number | null {
  const idx = elapsedMs / SAMPLE_DRIVE_INTERVAL_MS;
  const i0 = Math.floor(idx);
  if (i0 >= SAMPLE_DRIVE_MPH.length - 1) return null; // replay finished
  const frac = idx - i0;
  return SAMPLE_DRIVE_MPH[i0] * (1 - frac) + SAMPLE_DRIVE_MPH[i0 + 1] * frac;
}
