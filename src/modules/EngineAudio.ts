import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { AudioInfo, AudioStatus, EngineState } from '../types/engine';
import { SOUND_ASSETS, SoundName } from './soundAssets';

/**
 * EngineAudio: plays the simulated engine through the phone's audio output.
 * With the phone paired to the Tesla over Bluetooth, iOS routes this straight
 * to the car speakers.
 *
 * MVP approach: two seamless loops (idle + engine) crossfaded by speed, with
 * playback *rate* changes standing in for pitch (pitch correction disabled on
 * purpose — a faster loop should sound higher, like a revving engine), plus
 * one-shot shift and decel samples.
 *
 * Every native call is wrapped so a missing/corrupt sound file degrades the
 * audio status instead of crashing the app.
 */

/** Speed range over which idle crossfades into the engine loop. */
const CROSSFADE_MAX_MPH = 8;
/** Minimum gap between decel one-shots so braking doesn't machine-gun the sample. */
const DECEL_COOLDOWN_MS = 1500;

class EngineAudioController {
  private players: Partial<Record<SoundName, AudioPlayer>> = {};
  private status: AudioStatus = 'uninitialized';
  private missingSounds: string[] = [];
  private lastError: string | null = null;
  private running = false;
  private lastDecelAt = 0;

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

    for (const name of Object.keys(SOUND_ASSETS) as SoundName[]) {
      try {
        const player = createAudioPlayer(SOUND_ASSETS[name]);
        if (name === 'idle' || name === 'engine_loop') {
          player.loop = true;
          try {
            // We WANT pitch to follow playback rate — that's the whole effect.
            player.shouldCorrectPitch = false;
          } catch {
            // property not supported on some platforms; rate change still works
          }
        }
        player.volume = 0;
        this.players[name] = player;
      } catch (e) {
        this.missingSounds.push(name);
        this.lastError = `${name}: ${message(e)}`;
      }
    }

    if (!this.players.engine_loop && !this.players.idle) {
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
      this.players.idle?.play();
      this.players.engine_loop?.play();
      this.running = true;
    } catch (e) {
      this.lastError = `start: ${message(e)}`;
      this.status = 'error';
    }
    return this.getInfo();
  }

  stop(): AudioInfo {
    this.running = false;
    for (const player of Object.values(this.players)) {
      try {
        player?.pause();
      } catch {
        // ignore — stopping must never throw
      }
    }
    return this.getInfo();
  }

  /** Apply the latest simulated engine state to the audio layer. */
  update(state: EngineState): void {
    if (!this.running) return;

    // Crossfade idle <-> engine loop by speed so standstill sounds lumpy and
    // low instead of like a pitched-down highway pull.
    const blend = Math.min(1, Math.max(0, state.speedMph / CROSSFADE_MAX_MPH));

    const engine = this.players.engine_loop;
    if (engine) {
      try {
        engine.volume = clamp01(state.engineVolume * blend);
        engine.setPlaybackRate(clampRate(state.enginePitch));
      } catch (e) {
        this.lastError = `engine loop: ${message(e)}`;
      }
    }

    const idle = this.players.idle;
    if (idle) {
      try {
        idle.volume = clamp01(state.engineVolume * (1 - blend));
      } catch (e) {
        this.lastError = `idle loop: ${message(e)}`;
      }
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

  private playOneShot(name: SoundName, volume: number): void {
    const player = this.players[name];
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
    for (const name of Object.keys(this.players) as SoundName[]) {
      try {
        this.players[name]?.release();
      } catch {
        // ignore
      }
      delete this.players[name];
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
