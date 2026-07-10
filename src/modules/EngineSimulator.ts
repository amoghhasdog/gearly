import { EngineInput, EngineState } from '../types/engine';
import { normalizeToMph } from './UnitConverter';

/**
 * EngineSimulator: turns filtered speed into a fake engine state — gear, RPM,
 * volume, pitch and shift events. Purely speed-derived for now; acceleration
 * is estimated from speed deltas. Later, MotionSensorProvider /
 * TeslaScreenThrottleReader can feed a real acceleration signal in here.
 */

const IDLE_RPM = 800;
const MIN_MOVING_RPM = 1500;
/** RPM the engine "lands on" right after an upshift (gears 2+). */
const POST_SHIFT_RPM = 2800;
/** RPM at the top of each gear, just before shifting. */
const SHIFT_RPM = 6500;
const MAX_RPM = 7000;

/** Speed below which we consider the car stopped and play idle. */
const STOPPED_MPH = 0.5;
/** Hysteresis so the gear doesn't flap when hovering on a boundary. */
const GEAR_HYSTERESIS_MPH = 1;

/** mph/s thresholds for accel/decel classification. */
const ACCEL_THRESHOLD = 1.0;
const DECEL_THRESHOLD = -1.0;
/** EMA smoothing factor for the acceleration estimate. */
const ACCEL_ALPHA = 0.35;

interface GearRange {
  gear: number;
  minMph: number;
  maxMph: number;
}

const GEARS: GearRange[] = [
  { gear: 1, minMph: 0, maxMph: 15 },
  { gear: 2, minMph: 15, maxMph: 30 },
  { gear: 3, minMph: 30, maxMph: 50 },
  { gear: 4, minMph: 50, maxMph: 75 },
  { gear: 5, minMph: 75, maxMph: 120 }, // top gear: RPM keeps climbing to MAX_RPM
];

function gearForSpeed(mph: number): GearRange {
  for (const g of GEARS) {
    if (mph < g.maxMph) return g;
  }
  return GEARS[GEARS.length - 1];
}

export class EngineSimulator {
  private currentGear: GearRange | null = null;
  private lastMph: number | null = null;
  private lastTimestamp: number | null = null;
  private accelEma = 0;

  reset(): void {
    this.currentGear = null;
    this.lastMph = null;
    this.lastTimestamp = null;
    this.accelEma = 0;
  }

  update(input: EngineInput): EngineState {
    const mph = Math.max(0, normalizeToMph(input.speed, input.unit));

    // --- Acceleration estimate from speed deltas (all we have without sensors). ---
    if (this.lastMph != null && this.lastTimestamp != null) {
      const dtSec = Math.min(2, Math.max(0.05, (input.timestamp - this.lastTimestamp) / 1000));
      const rawAccel = (mph - this.lastMph) / dtSec;
      this.accelEma = ACCEL_ALPHA * rawAccel + (1 - ACCEL_ALPHA) * this.accelEma;
    }
    this.lastMph = mph;
    this.lastTimestamp = input.timestamp;

    const isAccelerating = this.accelEma > ACCEL_THRESHOLD;
    const isDecelerating = this.accelEma < DECEL_THRESHOLD;

    // --- Gear selection with hysteresis. ---
    const target = gearForSpeed(mph);
    let shouldTriggerShift = false;
    if (this.currentGear == null) {
      this.currentGear = target;
    } else if (target.gear !== this.currentGear.gear) {
      const leavingUp = mph > this.currentGear.maxMph + GEAR_HYSTERESIS_MPH;
      const leavingDown = mph < this.currentGear.minMph - GEAR_HYSTERESIS_MPH;
      if (leavingUp || leavingDown) {
        // Only an upshift gets the "shift" crack; downshifts happen under decel
        // and the decel sound covers them.
        shouldTriggerShift = target.gear > this.currentGear.gear && mph > STOPPED_MPH;
        this.currentGear = target;
      }
    }
    const gear = this.currentGear;

    // --- Virtual RPM. ---
    let rpm: number;
    if (mph < STOPPED_MPH) {
      rpm = IDLE_RPM;
    } else {
      const span = gear.maxMph - gear.minMph;
      const f = Math.min(1, Math.max(0, (mph - gear.minMph) / span));
      // Gear 1 pulls from just above idle; higher gears land at POST_SHIFT_RPM
      // after the shift drop, then climb back toward SHIFT_RPM.
      const startRpm = gear.gear === 1 ? MIN_MOVING_RPM : POST_SHIFT_RPM;
      const endRpm = gear.gear === GEARS.length ? MAX_RPM : SHIFT_RPM;
      rpm = startRpm + f * (endRpm - startRpm);
      // Hard acceleration revs a little past the nominal curve.
      rpm += Math.min(1, Math.max(0, this.accelEma / 10)) * 400;
      rpm = Math.min(MAX_RPM, Math.max(MIN_MOVING_RPM, rpm));
    }

    // --- Volume: louder with RPM, pushed up under acceleration, pulled back on decel. ---
    let volume: number;
    if (mph < STOPPED_MPH) {
      volume = 0.25; // quiet idle
    } else {
      volume = 0.35 + 0.45 * ((rpm - MIN_MOVING_RPM) / (MAX_RPM - MIN_MOVING_RPM));
      if (isAccelerating) volume += 0.15;
      if (isDecelerating) volume -= 0.15;
      volume = Math.min(1, Math.max(0.15, volume));
    }

    // --- Pitch: playback-rate multiplier. The loop is "recorded" at ~3000 RPM. ---
    const pitch = Math.min(2.0, Math.max(0.5, rpm / 3000));

    return {
      speedMph: mph,
      virtualGear: gear.gear,
      virtualRPM: Math.round(rpm),
      engineVolume: volume,
      enginePitch: pitch,
      isAccelerating,
      isDecelerating,
      accelerationEstimate: this.accelEma,
      shouldTriggerShift,
    };
  }
}
