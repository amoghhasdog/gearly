/**
 * FUTURE MODULE — not implemented yet.
 *
 * TeslaScreenThrottleReader: read the acceleration/regen bar the Tesla UI
 * draws under the speed number. That bar is the closest thing to a real
 * throttle signal we can get from the camera — far more direct than
 * differentiating OCR'd speed.
 *
 * Planned implementation:
 *  - a second calibration crop box over the throttle/regen bar
 *  - per-frame pixel analysis (no OCR): measure how far the bar extends left
 *    (regen/braking) or right (power) from center
 *  - output a normalized -1..1 throttle estimate for the EngineSimulator
 */
export interface ThrottleSample {
  /** -1 (full regen) .. 0 (coast) .. 1 (full power). */
  throttle: number;
  confidence: number;
  timestamp: number;
}

export class TeslaScreenThrottleReader {
  async start(): Promise<void> {
    throw new Error('TeslaScreenThrottleReader is not implemented yet');
  }

  stop(): void {
    // nothing to stop yet
  }

  setOnSample(_callback: (sample: ThrottleSample) => void): void {
    // will register the listener once implemented
  }
}
