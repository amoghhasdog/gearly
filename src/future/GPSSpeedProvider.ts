import { SpeedProvider, SpeedSample, SpeedSource } from '../types/speed';

/**
 * FUTURE MODULE — not implemented yet.
 *
 * GPSSpeedProvider: phone GPS as a backup speed source when camera OCR fails
 * (glare, screen off, phone bumped out of alignment).
 *
 * Planned implementation:
 *  - expo-location `watchPositionAsync` with BestForNavigation accuracy
 *  - map `coords.speed` (m/s) to mph, `coords.accuracy` to the sample accuracy
 *  - feed samples into SensorFusionEngine alongside camera OCR
 *
 * Note: GPS speed lags real speed by ~1s and is poor below ~5 mph.
 */
export class GPSSpeedProvider implements SpeedProvider {
  readonly source: SpeedSource = 'gps';

  async start(): Promise<void> {
    throw new Error('GPSSpeedProvider is not implemented yet');
  }

  stop(): void {
    // nothing to stop yet
  }

  setOnSample(_callback: (sample: SpeedSample) => void): void {
    // will register the listener once implemented
  }
}
