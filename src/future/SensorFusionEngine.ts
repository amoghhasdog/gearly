import { SpeedProvider, SpeedSample } from '../types/speed';

/**
 * FUTURE MODULE — not implemented yet.
 *
 * SensorFusionEngine: combine camera OCR speed, GPS, motion sensors and the
 * camera-read throttle bar into one best-estimate driving state.
 *
 * Planned implementation:
 *  - all sources implement SpeedProvider / emit SpeedSample (see types/speed.ts)
 *  - a simple complementary or Kalman filter weighted by each source's
 *    accuracy and freshness; camera OCR is the position anchor, motion sensors
 *    provide the high-frequency acceleration term, GPS backs up dropouts
 *  - output shape stays compatible with SpeedFilter.getCurrentSpeed() so the
 *    EngineSimulator doesn't need to change
 */
export class SensorFusionEngine {
  private providers: SpeedProvider[] = [];

  addProvider(provider: SpeedProvider): void {
    this.providers.push(provider);
  }

  async start(): Promise<void> {
    throw new Error('SensorFusionEngine is not implemented yet');
  }

  stop(): void {
    // nothing to stop yet
  }

  setOnFusedSample(_callback: (sample: SpeedSample) => void): void {
    // will register the listener once implemented
  }
}
