import { FilterSnapshot, SpeedReading, SpeedUnit } from '../types/speed';
import { normalizeToMph } from './UnitConverter';

/**
 * SpeedFilter: turns noisy per-frame OCR readings into a stable speed.
 *
 * Rules (see README for rationale):
 *  - keep the last valid speed; ignore empty / non-numeric results
 *  - reject out-of-range values (> 200 mph)
 *  - reject physically unrealistic jumps unless confirmed over several frames
 *  - don't drop to 0 unless 0 is read repeatedly (or we were already slow)
 *  - exponential smoothing, with alpha scaled by OCR confidence when present
 *  - go "stale" (and eventually decay to 0) if OCR keeps failing
 */

export interface SpeedFilterConfig {
  maxSpeedMph: number;
  /** Max believable acceleration, mph per second. ~12 covers hard Tesla launches. */
  maxAccelMphPerSec: number;
  /** Extra slack added to the jump limit to absorb OCR timing jitter. */
  jumpMarginMph: number;
  /** Consecutive similar readings needed to accept a large jump. */
  jumpConfirmFrames: number;
  /**
   * If a reading consistent with the current speed was accepted within this
   * window, a pending jump needs extra confirmations. A real speed change
   * moves through intermediate values; a "teleport" contradicted by fresh
   * consistent readings is almost always a repeated misread (e.g. a stray
   * glyph OCR'd as "4" every few frames while cruising at 28).
   */
  recentConsistentWindowMs: number;
  /** Extra confirmations required inside that window. */
  jumpExtraConfirmations: number;
  /** How close (mph) repeat readings must be to count as confirming a jump. */
  jumpMatchToleranceMph: number;
  /** Consecutive zero readings needed to accept 0 while moving. */
  zeroConfirmFrames: number;
  /** After this many ms without a valid reading the speed is flagged stale. */
  staleAfterMs: number;
  /** After this many ms without a valid reading the speed starts decaying to 0. */
  decayAfterMs: number;
  /** Decay rate once stale, mph per second (a gentle coast-down, not a cliff). */
  decayRateMphPerSec: number;
  alphaHighConfidence: number;
  alphaDefault: number;
  alphaLowConfidence: number;
}

const DEFAULT_CONFIG: SpeedFilterConfig = {
  maxSpeedMph: 200,
  maxAccelMphPerSec: 12,
  jumpMarginMph: 3,
  jumpConfirmFrames: 3,
  recentConsistentWindowMs: 2000,
  jumpExtraConfirmations: 2,
  jumpMatchToleranceMph: 8,
  zeroConfirmFrames: 3,
  staleAfterMs: 2500,
  decayAfterMs: 4000,
  decayRateMphPerSec: 6,
  alphaHighConfidence: 0.5,
  alphaDefault: 0.4,
  alphaLowConfidence: 0.25,
};

export class SpeedFilter {
  private config: SpeedFilterConfig;

  private filteredSpeedMph: number | null = null;
  private lastValidSpeedMph: number | null = null;
  private lastValidTimestamp: number | null = null;
  private rejectedCount = 0;
  private lastRejectionReason: string | null = null;

  /** Pending large jump waiting for multi-frame confirmation. */
  private pendingJump: { valueMph: number; count: number } | null = null;
  /**
   * First-ever reading waiting for confirmation. A single misread as the very
   * first sample would otherwise anchor the filter to a bogus speed and make
   * it reject every real reading after it (seen in real footage: an initial
   * "90" misread at ~11 mph poisoned 15 s of readings).
   */
  private pendingAnchor: { valueMph: number; count: number } | null = null;
  private zeroStreak = 0;
  /** Timestamp of the last accepted reading that agreed with the filtered speed. */
  private lastConsistentAcceptTs: number | null = null;

  constructor(config?: Partial<SpeedFilterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reset(): void {
    this.filteredSpeedMph = null;
    this.lastValidSpeedMph = null;
    this.lastValidTimestamp = null;
    this.rejectedCount = 0;
    this.lastRejectionReason = null;
    this.pendingJump = null;
    this.pendingAnchor = null;
    this.zeroStreak = 0;
    this.lastConsistentAcceptTs = null;
  }

  /** Feed one OCR reading (in the unit shown on the Tesla screen). */
  update(reading: SpeedReading, unit: SpeedUnit, now: number = Date.now()): FilterSnapshot {
    if (reading.status === 'no_text' || reading.status === 'invalid' || reading.parsedSpeed == null) {
      // A dropout breaks any jump-confirmation streak: sporadic identical
      // garbage (e.g. a stray glyph misread as "4" every few seconds) must not
      // accumulate confirmations across gaps and hijack the speed. Real hard
      // braking produces *consecutive* readings, which still confirm fine.
      this.pendingJump = null;
      return this.reject(reading.status === 'no_text' ? 'no text' : 'non-numeric OCR result', now);
    }

    const mph = normalizeToMph(reading.parsedSpeed, unit);

    if (mph < 0 || mph > this.config.maxSpeedMph) {
      return this.reject(`out of range (${Math.round(mph)} mph)`, now);
    }

    // --- First-ever reading: require two consecutive readings that roughly
    // agree before anchoring the filter. ---
    if (this.lastValidSpeedMph == null) {
      if (
        this.pendingAnchor &&
        Math.abs(mph - this.pendingAnchor.valueMph) <= this.config.jumpMatchToleranceMph
      ) {
        return this.accept(mph, reading.confidence, now);
      }
      this.pendingAnchor = { valueMph: mph, count: 1 };
      return this.reject(`initial reading ${mph.toFixed(0)} mph awaiting confirmation`, now);
    }

    // --- Zero handling: a hard drop to 0 needs repeated confirmation, so a
    // single misread doesn't cut the engine while cruising. ---
    const currentlyMoving = (this.filteredSpeedMph ?? 0) > 5;
    if (mph === 0 && currentlyMoving) {
      this.zeroStreak += 1;
      if (this.zeroStreak < this.config.zeroConfirmFrames) {
        return this.reject(`zero not yet confirmed (${this.zeroStreak}/${this.config.zeroConfirmFrames})`, now);
      }
      // Confirmed stop — accept it, bypassing the jump check (hard braking is real).
      return this.accept(mph, reading.confidence, now);
    }
    this.zeroStreak = 0;

    // --- Unrealistic jump rejection with multi-frame confirmation. ---
    if (this.lastValidTimestamp != null) {
      const dtSec = Math.max(0.1, (now - this.lastValidTimestamp) / 1000);
      const maxDelta = this.config.maxAccelMphPerSec * dtSec + this.config.jumpMarginMph;
      const delta = Math.abs(mph - this.lastValidSpeedMph);

      if (delta > maxDelta) {
        if (
          this.pendingJump &&
          Math.abs(mph - this.pendingJump.valueMph) <= this.config.jumpMatchToleranceMph
        ) {
          this.pendingJump.count += 1;
          this.pendingJump.valueMph = mph; // track drift while confirming
        } else {
          this.pendingJump = { valueMph: mph, count: 1 };
        }

        // A teleport contradicted by recent consistent readings is held to a
        // higher standard than one following a blind stretch.
        const contradicted =
          this.lastConsistentAcceptTs != null &&
          now - this.lastConsistentAcceptTs < this.config.recentConsistentWindowMs;
        const required =
          this.config.jumpConfirmFrames + (contradicted ? this.config.jumpExtraConfirmations : 0);

        if (this.pendingJump.count < required) {
          return this.reject(
            `unrealistic jump ${this.lastValidSpeedMph.toFixed(0)}→${mph.toFixed(0)} mph ` +
              `(${this.pendingJump.count}/${required} confirmations)`,
            now
          );
        }
        // Same "impossible" value seen repeatedly — trust it: OCR is right and
        // our previous state was wrong (bad anchor, missed stretch, ...).
        // Snap straight there instead of EMA-gliding from the wrong value.
        return this.accept(mph, reading.confidence, now, true);
      }
    }

    return this.accept(mph, reading.confidence, now);
  }

  private accept(
    mph: number,
    confidence: number | undefined,
    now: number,
    snap = false
  ): FilterSnapshot {
    this.pendingJump = null;
    this.pendingAnchor = null;
    if (mph === 0) this.zeroStreak = 0;

    const alpha =
      confidence == null
        ? this.config.alphaDefault
        : confidence >= 0.7
          ? this.config.alphaHighConfidence
          : this.config.alphaLowConfidence;

    this.filteredSpeedMph =
      this.filteredSpeedMph == null || snap
        ? mph
        : alpha * mph + (1 - alpha) * this.filteredSpeedMph;
    this.lastConsistentAcceptTs = now;
    this.lastValidSpeedMph = mph;
    this.lastValidTimestamp = now;
    this.lastRejectionReason = null;
    return this.getSnapshot(now);
  }

  private reject(reason: string, now: number): FilterSnapshot {
    this.rejectedCount += 1;
    this.lastRejectionReason = reason;
    return this.getSnapshot(now);
  }

  getSnapshot(now: number = Date.now()): FilterSnapshot {
    return {
      filteredSpeedMph: this.getCurrentSpeed(now).speedMph,
      lastValidSpeedMph: this.lastValidSpeedMph,
      lastValidTimestamp: this.lastValidTimestamp,
      isStale: this.isStale(now),
      rejectedCount: this.rejectedCount,
      lastRejectionReason: this.lastRejectionReason,
    };
  }

  isStale(now: number = Date.now()): boolean {
    if (this.lastValidTimestamp == null) return true;
    return now - this.lastValidTimestamp > this.config.staleAfterMs;
  }

  /**
   * The speed the rest of the app should use right now. Holds the last valid
   * value briefly through OCR dropouts, then coasts down to 0 so a lost camera
   * never leaves the engine screaming at highway RPM.
   */
  getCurrentSpeed(now: number = Date.now()): { speedMph: number; isStale: boolean } {
    if (this.filteredSpeedMph == null || this.lastValidTimestamp == null) {
      return { speedMph: 0, isStale: true };
    }
    const age = now - this.lastValidTimestamp;
    let speed = this.filteredSpeedMph;
    if (age > this.config.decayAfterMs) {
      const decaySec = (age - this.config.decayAfterMs) / 1000;
      speed = Math.max(0, speed - this.config.decayRateMphPerSec * decaySec);
    }
    return { speedMph: speed, isStale: this.isStale(now) };
  }
}
