import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { AudioInfo, AudioStatus, EngineState } from '../types/engine';
import { SOUND_ASSETS, SoundName } from './soundAssets';

/**
 * EngineAudio: plays the simulated engine through the phone's audio output.
 * With the phone paired to the Tesla over Bluetooth, iOS routes this straight
 * to the car speakers.
 *
 * Architecture (the racing-game approach, scaled down):
 *  - THREE seamless loops: idle, engine_low (≙ ~2200 RPM) and engine_high
 *    (≙ ~5200 RPM). Each is rate-shifted toward the current virtual RPM and
 *    the layers are equal-power crossfaded, so no single sample is stretched
 *    across the whole RPM range.
 *  - The simulator pushes a *target* state ~4x/s; an internal 15 Hz smoothing
 *    loop eases actual volume/rate toward the target every ~66 ms. This kills
 *    the audible stair-stepping that direct 4 Hz jumps produce.
 *  - One-shot shift/decel samples on top.
 *
 * Every native call is wrapped so a missing/corrupt sound file degrades the
 * audio status instead of crashing the app.
 */

/** Speed range over which idle crossfades into the engine layers. */
const CROSSFADE_MAX_MPH = 8;
/** Virtual RPM each engine layer was "recorded" at. */
const LOW_LAYER_RPM = 2200;
const HIGH_LAYER_RPM = 5200;
/** RPM band over which low crossfades into high. */
const LAYER_FADE_START = 2800;
const LAYER_FADE_END = 4600;
/** Smoothing loop cadence and easing factors (fraction of gap closed per tick). */
const SMOOTH_TICK_MS = 66;
const VOLUME_EASE = 0.35;
const RATE_EASE = 0.22;
/** Minimum gap between decel one-shots so braking doesn't machine-gun the sample. */
const DECEL_COOLDOWN_MS = 1500;

interface LoopChannel {
  player: AudioPlayer;
  volume: number;
  targetVolume: number;
  rate: number;
  targetRate: number;
}

class EngineAudioController {
  private loops: Partial<Record<'idle' | 'engine_low' | 'engine_high', LoopChannel>> = {};
  private oneShots: Partial<Record<'shift' | 'decel', AudioPlayer>> = {};
  private status: AudioStatus = 'uninitialized';
  private missingSounds: string[] = [];
  private lastError: string | null = null;
  private running = false;
  private lastDecelAt = 0;
  private smoother: ReturnType<typeof setInterval> | null = null;

  getInfo(): AudioInfo {
    return {
      status: this.status,
      isRunning: this.running,
      missingSounds: [...this.missingSounds],
      lastError: this.lastError,
    };
  }

  /** Load sounds and configure the audio session. Safe to call repeatedly. */
  async init(): Promise<AudioInfo> {
    if (this.status === 'ready' || this.status === 'partial') return this.getInfo();
    this.status = 'initializing';
    this.missingSounds = [];
    this.lastError = null;

    try {
      // playsInSilentMode: the engine must keep roaring with the mute switch on.
      // duckOthers: lower (not stop) music/navigation prompts from other apps.
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
      });
    } catch (e) {
      this.lastError = `audio mode: ${message(e)}`;
    }

    const loopNames = ['idle', 'engine_low', 'engine_high'] as const;
    for (const name of loopNames) {
      try {
        const player = createAudioPlayer(SOUND_ASSETS[name]);
        player.loop = true;
        try {
          // We WANT pitch to follow playback rate — that's the whole effect.
          player.shouldCorrectPitch = false;
        } catch {
          // property not supported on some platforms; rate change still works
        }
        player.volume = 0;
        this.loops[name] = { player, volume: 0, targetVolume: 0, rate: 1, targetRate: 1 };
      } catch (e) {
        this.missingSounds.push(name);
        this.lastError = `${name}: ${message(e)}`;
      }
    }

    for (const name of ['shift', 'decel'] as const) {
      try {
        const player = createAudioPlayer(SOUND_ASSETS[name]);
        player.volume = 0;
        this.oneShots[name] = player;
      } catch (e) {
        this.missingSounds.push(name);
        this.lastError = `${name}: ${message(e)}`;
      }
    }

    if (!this.loops.engine_low && !this.loops.idle) {
      this.status = 'unavailable';
    } else {
      this.status = this.missingSounds.length > 0 ? 'partial' : 'ready';
    }
    return this.getInfo();
  }

  async start(): Promise<AudioInfo> {
    await this.init();
    if (this.status === 'unavailable') return this.getInfo();
    try {
      for (const ch of Object.values(this.loops)) ch?.player.play();
      this.running = true;
      this.startSmoother();
    } catch (e) {
      this.lastError = `start: ${message(e)}`;
      this.status = 'error';
    }
    return this.getInfo();
  }

  stop(): AudioInfo {
    this.running = false;
    if (this.smoother) {
      clearInterval(this.smoother);
      this.smoother = null;
    }
    for (const ch of Object.values(this.loops)) {
      try {
        ch?.player.pause();
      } catch {
        // stopping must never throw
      }
    }
    return this.getInfo();
  }

  /**
   * Receive the latest simulated engine state. Only sets *targets* — the
   * smoothing loop applies them gradually so nothing jumps audibly.
   */
  update(state: EngineState): void {
    if (!this.running) return;

    // Idle <-> engine crossfade by speed (equal-power).
    const engineBlend = Math.min(1, Math.max(0, state.speedMph / CROSSFADE_MAX_MPH));
    const idleW = Math.cos((engineBlend * Math.PI) / 2);
    const engineW = Math.sin((engineBlend * Math.PI) / 2);

    // Low <-> high layer crossfade by RPM (equal-power).
    const layerBlend = Math.min(
      1,
      Math.max(0, (state.virtualRPM - LAYER_FADE_START) / (LAYER_FADE_END - LAYER_FADE_START))
    );
    const lowW = Math.cos((layerBlend * Math.PI) / 2);
    const highW = Math.sin((layerBlend * Math.PI) / 2);

    if (this.loops.idle) {
      this.loops.idle.targetVolume = clamp01(state.engineVolume * idleW);
      this.loops.idle.targetRate = 1;
    }
    if (this.loops.engine_low) {
      this.loops.engine_low.targetVolume = clamp01(state.engineVolume * engineW * lowW);
      this.loops.engine_low.targetRate = clampRate(state.virtualRPM / LOW_LAYER_RPM);
    }
    if (this.loops.engine_high) {
      this.loops.engine_high.targetVolume = clamp01(state.engineVolume * engineW * highW);
      this.loops.engine_high.targetRate = clampRate(state.virtualRPM / HIGH_LAYER_RPM);
    }

    if (state.shouldTriggerShift) {
      this.playOneShot('shift', 0.8);
    }
    if (state.isDecelerating && state.speedMph > 5) {
      const now = Date.now();
      if (now - this.lastDecelAt > DECEL_COOLDOWN_MS) {
        this.lastDecelAt = now;
        this.playOneShot('decel', 0.5);
      }
    }
  }

  /** 15 Hz easing loop: move actual volume/rate toward targets in small steps. */
  private startSmoother(): void {
    if (this.smoother) return;
    this.smoother = setInterval(() => {
      if (!this.running) return;
      for (const ch of Object.values(this.loops)) {
        if (!ch) continue;
        try {
          const dv = ch.targetVolume - ch.volume;
          if (Math.abs(dv) > 0.005) {
            ch.volume += dv * VOLUME_EASE;
            ch.player.volume = clamp01(ch.volume);
          }
          const dr = ch.targetRate - ch.rate;
          if (Math.abs(dr) > 0.004) {
            ch.rate += dr * RATE_EASE;
            ch.player.setPlaybackRate(clampRate(ch.rate));
          }
        } catch (e) {
          this.lastError = `smoother: ${message(e)}`;
        }
      }
    }, SMOOTH_TICK_MS);
  }

  private playOneShot(name: 'shift' | 'decel', volume: number): void {
    const player = this.oneShots[name];
    if (!player) return;
    try {
      player.volume = clamp01(volume);
      player.seekTo(0).catch(() => {});
      player.play();
    } catch (e) {
      this.lastError = `${name}: ${message(e)}`;
    }
  }

  /** Fully tear down native players (e.g. on app shutdown). */
  release(): void {
    this.stop();
    for (const key of Object.keys(this.loops) as (keyof typeof this.loops)[]) {
      try {
        this.loops[key]?.player.release();
      } catch {
        // ignore
      }
      delete this.loops[key];
    }
    for (const key of Object.keys(this.oneShots) as (keyof typeof this.oneShots)[]) {
      try {
        this.oneShots[key]?.release();
      } catch {
        // ignore
      }
      delete this.oneShots[key];
    }
    this.status = 'uninitialized';
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** expo-audio supports 0.1–2.0 on iOS/Android. */
function clampRate(v: number): number {
  return Math.min(2.0, Math.max(0.5, v));
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** App-wide singleton — audio must survive screen/component remounts. */
export const EngineAudio = new EngineAudioController();

// Keep SoundName import referenced for the asset registry type.
export type { SoundName };
