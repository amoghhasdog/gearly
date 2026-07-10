import { SpeedUnit } from '../types/speed';

/**
 * Unit conversion helpers. The whole app uses mph as its canonical internal
 * unit; km/h only exists at the edges (OCR input and display output).
 */

const KMH_PER_MPH = 1.609344;

export function mphToKmh(mph: number): number {
  return mph * KMH_PER_MPH;
}

export function kmhToMph(kmh: number): number {
  return kmh / KMH_PER_MPH;
}

/** Convert a value read in `unit` into canonical mph. */
export function normalizeToMph(value: number, unit: SpeedUnit): number {
  return unit === 'kmh' ? kmhToMph(value) : value;
}

/** Convert a canonical mph value into the user's display unit. */
export function mphToUnit(mph: number, unit: SpeedUnit): number {
  return unit === 'kmh' ? mphToKmh(mph) : mph;
}

/** Format a canonical mph speed for display in the selected unit. */
export function formatSpeed(mph: number | null, unit: SpeedUnit): string {
  if (mph == null || !Number.isFinite(mph)) return '--';
  const value = Math.round(mphToUnit(mph, unit));
  return `${value} ${unit === 'kmh' ? 'km/h' : 'mph'}`;
}
