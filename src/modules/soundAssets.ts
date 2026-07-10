/**
 * Static sound asset registry.
 *
 * Metro resolves require() calls at bundle time, so these files MUST exist in
 * assets/sounds/ for the app to build (see assets/sounds/README.md). Runtime
 * load/decode failures are still handled gracefully in EngineAudio — a broken
 * file downgrades the audio status instead of crashing the app.
 */
export const SOUND_ASSETS = {
  idle: require('../../assets/sounds/idle.wav'),
  engine_low: require('../../assets/sounds/engine_low.wav'),
  engine_high: require('../../assets/sounds/engine_high.wav'),
  shift: require('../../assets/sounds/shift.wav'),
  decel: require('../../assets/sounds/decel.wav'),
} as const;

export type SoundName = keyof typeof SOUND_ASSETS;
