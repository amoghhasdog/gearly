# Placeholder engine sounds

These WAVs are synthesized placeholders (see the repo root README). They exist
so the app makes audible, speed-responsive noise out of the box.

- `idle.wav` — 1.0 s seamless loop, low lumpy idle (~65 Hz)
- `engine_loop.wav` — 1.0 s seamless loop (~100 Hz); playback rate is varied
  0.5×–2.0× to track virtual RPM
- `shift.wav` — short one-shot, gear-shift thump
- `decel.wav` — short one-shot, falling-pitch decel burble

## Replacing them

Overwrite the files but **keep these exact filenames** — they are resolved at
bundle time by Metro in `src/modules/soundAssets.ts`. Deleting a file without
updating that module will break the build.

Tips for good replacements:
- Loops must be seamless: identical amplitude/phase at start and end.
- Record/choose the engine loop at a "middle" RPM feel — the app plays it from
  0.5× to 2.0× speed, so extremes of the range should still sound plausible.
- Mono is fine; car Bluetooth is not an audiophile pipeline.
