# EngineCam

A Tesla makes no engine noise. EngineCam makes your iPhone pretend it does.

Mount your iPhone facing the Tesla's screen. The app's camera reads the displayed speed number with on-device OCR, converts it into a fake engine state (virtual RPM, fake gears, shift points, acceleration behavior), and plays a simulated engine loop whose pitch and volume follow your driving. With the phone paired to the Tesla over Bluetooth, the fake engine plays through the car speakers.

**MVP scope:** camera-based speed reading only. No GPS, no accelerometer/gyroscope, no Tesla API, no throttle-bar reading — but the code is structured so all of those can be added later (see `src/future/`).

## How it works

```
Camera photo (every ~500 ms)
  → crop to the calibrated box over the speed number
  → ML Kit on-device OCR
  → parse digits (with O→0, I→1, S→5, B→8 fixes)
  → SpeedFilter (range checks, jump rejection, zero confirmation, smoothing, stale decay)
  → EngineSimulator (fake gear, virtual RPM, volume, pitch, shift events)
  → EngineAudio (looping engine sample: playback rate = pitch, plus shift/decel one-shots)
```

## Requirements

- Node 20+, npm
- An iPhone
- **A development build** — OCR uses ML Kit, a native module that does **not** run inside Expo Go. Everything else (camera, crop box, audio) works in Expo Go; OCR will show as "UNAVAILABLE" in the debug panel there.

> The project is pinned to **Expo SDK 54** on purpose: it's the newest SDK the
> iOS App Store version of Expo Go can run (newer Expo Go releases are stuck in
> Apple review — see Expo's May 2026 changelog). Don't upgrade the SDK if you
> still want Expo Go previews to work.

## Run it

```bash
npm install

# Option A (recommended): cloud dev build with EAS
npx eas build --profile development --platform ios
# install the build on your iPhone, then:
npx expo start

# Option B: local build (requires a Mac with Xcode)
npx expo run:ios --device

# Quick UI-only preview (no OCR) in Expo Go:
npx expo start
```

`npm run typecheck` runs the TypeScript compiler.

## Setup in the car

1. **Bluetooth:** pair your iPhone with the Tesla (Controls → Bluetooth on the car). Select your phone as the audio source. Any audio the app plays now comes out of the car speakers.
2. **Mounting:** put the phone in a rigid mount (vent/dash mount) with the **rear camera facing the Tesla's screen**, close enough that the speed number is large in frame, angled to minimize glare. The mount must not wobble — motion blur kills OCR.
3. **Calibration:** open the app, accept the safety notice, then drag the red box tightly around the speed number on the Tesla screen (drag the body to move, the corner dot to resize). Tight is right: the box should contain the digits and almost nothing else. Pick your unit (must match what the Tesla displays!), then tap **Start Reading**. Watch the debug panel — "Raw OCR text" should show the speed. The crop box and unit are saved automatically for next time.
4. Tap **Start Engine Sound**. Drive.

## Placeholder sounds

`assets/sounds/` ships with synthesized placeholder WAVs (generated sawtooth tones — clearly audible, clearly change with speed, clearly not a Ferrari):

| File | Role |
|---|---|
| `idle.wav` | seamless idle loop (played near 0 mph) |
| `engine_loop.wav` | seamless engine loop; playback rate follows virtual RPM |
| `shift.wav` | one-shot on fake gear upshift |
| `decel.wav` | one-shot on deceleration |

To replace them, overwrite the files **keeping the same filenames** (Metro resolves them at build time in `src/modules/soundAssets.ts`). Loops must be seamless (start and end at the same phase). Sound packs (V8, V10, F1, turbo, spaceship…) are a planned feature — they'll slot in as alternative asset sets behind the same four roles.

## Project structure

```
src/
  components/   SafetyNotice, CameraPreviewWithCropBox, CropBoxOverlay,
                EngineDashboard, DebugPanel
  screens/      MainScreen (camera + controls + dashboard + debug)
  modules/      SpeedReader (crop + OCR + parse), SpeedFilter, UnitConverter,
                EngineSimulator, EngineAudio, soundAssets
  future/       GPSSpeedProvider, MotionSensorProvider,
                TeslaScreenThrottleReader, SensorFusionEngine  (stubs/interfaces only)
  types/        speed.ts, engine.ts
assets/sounds/  placeholder engine audio
```

## Current limitations

- OCR accuracy depends on camera angle, glare, screen brightness, and motion blur.
- Only the speed number is read — not the real throttle/regen bar — so engine response is estimated from speed changes and lags real pedal input.
- Bluetooth audio adds latency (often 100–300 ms) on top of that.
- Tesla UI changes (software updates, layout differences between models) can move the speed number; recalibrate the crop box if readings stop.
- OCR requires a development build; Expo Go runs the app but reads nothing.
- Image preprocessing is minimal (crop + upscale). Grayscale/contrast/thresholding are marked as TODOs in `SpeedReader.ts` and would help in poor light.
- GPS and motion sensors are not implemented yet (`src/future/`).
- Android is planned but untested and not a priority for this version.

## Safety

Mount your phone securely before driving. Do not interact with the app while driving. Start the app before moving. This app is a toy — keep your eyes on the road, not on the debug panel.
