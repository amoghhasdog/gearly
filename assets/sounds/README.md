# Placeholder engine sounds

These WAVs are synthesized placeholders (see the repo root README). They exist
so the app makes audible, speed-responsive noise out of the box.

- `idle.wav` — 3 s seamless loop, lumpy low idle (~62 Hz, detuned beat)
- `engine_low.wav` — 4 s seamless loop, torquey low-RPM layer; treated as
  "recorded at ~2200 RPM" and rate-shifted toward the current virtual RPM
- `engine_high.wav` — 4 s seamless loop, raspy high-RPM layer (~5200 RPM);
  crossfaded in above ~2800 RPM, fully in by ~4600 RPM
- `shift.wav` — short one-shot, gear-shift thump
- `decel.wav` — short one-shot, falling-pitch decel burble

The two engine layers are equal-power crossfaded by RPM (the racing-game
technique) so no single sample gets stretched across the whole rev range.

## Replacing them

Overwrite the files but **keep these exact filenames** — they are resolved at
bundle time by Metro in `src/modules/soundAssets.ts`. Deleting a file without
updating that module will break the build.

Tips for good replacements:
- Loops must be seamless: identical amplitude/phase at start and end.
- Record `engine_low` around 2000-2500 RPM and `engine_high` around 5000-5500
  RPM (or adjust LOW_LAYER_RPM / HIGH_LAYER_RPM in `src/modules/EngineAudio.ts`
  to match your samples).
- Mono is fine; car Bluetooth is not an audiophile pipeline.
