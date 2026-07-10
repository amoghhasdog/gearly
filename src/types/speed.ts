/**
 * Speed-related types shared across the app.
 */

export type SpeedUnit = 'mph' | 'kmh';

export type SpeedReadingStatus = 'valid' | 'invalid' | 'low_confidence' | 'no_text';

/** One raw OCR read of the Tesla screen's speed number. */
export interface SpeedReading {
  rawText: string;
  parsedSpeed: number | null;
  confidence?: number;
  timestamp: number;
  status: SpeedReadingStatus;
}

/**
 * Crop box in coordinates normalized to the camera preview (all values 0..1).
 * Normalized coords survive preview resizes and are what we persist.
 */
export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Current state of the speed filter, for the dashboard/debug panel. */
export interface FilterSnapshot {
  /** Smoothed speed in mph, or null if we have never had a valid reading. */
  filteredSpeedMph: number | null;
  lastValidSpeedMph: number | null;
  lastValidTimestamp: number | null;
  /** True when OCR has failed for too long and the speed can no longer be trusted. */
  isStale: boolean;
  rejectedCount: number;
  lastRejectionReason: string | null;
}

/**
 * Where a speed sample came from. Only 'camera_ocr' is implemented today;
 * the rest exist so future providers (see src/future/) plug into the same shape.
 */
export type SpeedSource = 'camera_ocr' | 'gps' | 'motion' | 'fusion';

export interface SpeedSample {
  speedMph: number;
  /** 0..1 estimate of how much to trust this sample, if the source knows. */
  accuracy?: number;
  timestamp: number;
  source: SpeedSource;
}

/**
 * Common interface every speed source (camera OCR, GPS, sensor fusion, ...)
 * will implement, so SensorFusionEngine can consume them uniformly later.
 */
export interface SpeedProvider {
  readonly source: SpeedSource;
  start(): Promise<void>;
  stop(): void;
  setOnSample(callback: (sample: SpeedSample) => void): void;
}
