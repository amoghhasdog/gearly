/**
 * FUTURE MODULE — not implemented yet.
 *
 * MotionSensorProvider: accelerometer + gyroscope for instant acceleration,
 * braking, bumps, and detecting that the phone mount has moved (which should
 * invalidate the crop-box calibration).
 *
 * Planned implementation:
 *  - expo-sensors Accelerometer/Gyroscope at ~50 Hz
 *  - gravity removal via low-pass, project onto the car's forward axis
 *  - expose an acceleration stream the EngineSimulator can prefer over
 *    speed-delta estimation (much lower latency for throttle response)
 */
export interface MotionSample {
  /** Forward acceleration in m/s^2 (positive = accelerating). */
  forwardAcceleration: number;
  /** True when the phone itself appears to have been moved in its mount. */
  mountDisturbed: boolean;
  timestamp: number;
}

export class MotionSensorProvider {
  async start(): Promise<void> {
    throw new Error('MotionSensorProvider is not implemented yet');
  }

  stop(): void {
    // nothing to stop yet
  }

  setOnSample(_callback: (sample: MotionSample) => void): void {
    // will register the listener once implemented
  }
}
