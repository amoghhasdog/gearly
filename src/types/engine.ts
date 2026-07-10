import { SpeedUnit } from './speed';

/** Input to the engine simulator: the latest filtered speed. */
export interface EngineInput {
  speed: number;
  unit: SpeedUnit;
  timestamp: number;
}

/** Fake engine state derived from speed. Drives the audio layer and dashboard. */
export interface EngineState {
  speedMph: number;
  virtualGear: number;
  virtualRPM: number;
  /** 0..1 master volume for the engine loop. */
  engineVolume: number;
  /** Playback-rate multiplier applied to the engine loop (1 = recorded pitch). */
  enginePitch: number;
  isAccelerating: boolean;
  isDecelerating: boolean;
  /** Estimated acceleration in mph per second, smoothed. */
  accelerationEstimate: number;
  /** True for exactly one tick when the fake gear changes. */
  shouldTriggerShift: boolean;
}

export type AudioStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'partial' // some sounds failed to load but the engine loop works
  | 'unavailable'
  | 'error';

export interface AudioInfo {
  status: AudioStatus;
  isRunning: boolean;
  missingSounds: string[];
  lastError: string | null;
}
