import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CameraPreviewWithCropBox from '../components/CameraPreviewWithCropBox';
import DebugPanel from '../components/DebugPanel';
import DebugSpeedControls from '../components/DebugSpeedControls';
import EngineDashboard from '../components/EngineDashboard';
import { sampleDriveSpeedAt } from '../debug/sampleDrive';
import { EngineAudio } from '../modules/EngineAudio';
import { EngineSimulator } from '../modules/EngineSimulator';
import { SpeedFilter } from '../modules/SpeedFilter';
import { SpeedReader } from '../modules/SpeedReader';
import { AudioInfo, EngineState } from '../types/engine';
import { CropBox, FilterSnapshot, SpeedReading, SpeedUnit } from '../types/speed';

/**
 * Single main screen: camera + crop box on top (calibration), controls,
 * engine dashboard and debug panel below. Everything lives on one screen so
 * the camera never unmounts while OCR is running.
 */

const READ_INTERVAL_MS = 500; // OCR cadence (300-700 ms is the practical range)
const ENGINE_TICK_MS = 250; // simulator/audio update cadence, smoother than OCR

const STORAGE_KEYS = {
  cropBox: 'enginecam.cropBox.v1',
  unit: 'enginecam.unit.v1',
};

const DEFAULT_CROP_BOX: CropBox = { x: 0.3, y: 0.35, width: 0.4, height: 0.2 };

export default function MainScreen() {
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });

  const [cropBox, setCropBox] = useState<CropBox>(DEFAULT_CROP_BOX);
  const [unit, setUnit] = useState<SpeedUnit>('mph');
  const [isReading, setIsReading] = useState(false);

  const [lastReading, setLastReading] = useState<SpeedReading | null>(null);
  const [filterSnap, setFilterSnap] = useState<FilterSnapshot | null>(null);
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [audioInfo, setAudioInfo] = useState<AudioInfo>(EngineAudio.getInfo());

  // Debug speed simulation: manual slider or replay of a recorded drive.
  // When active, it replaces the camera as the simulator's speed source.
  const [simEnabled, setSimEnabled] = useState(false);
  const [simSpeedMph, setSimSpeedMph] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);

  // Long-lived logic modules (never recreated on re-render).
  const speedReader = useRef(new SpeedReader()).current;
  const speedFilter = useRef(new SpeedFilter()).current;
  const simulator = useRef(new EngineSimulator()).current;

  // Refs mirroring state so the async loops always see current values.
  const cropBoxRef = useRef(cropBox);
  cropBoxRef.current = cropBox;
  const unitRef = useRef(unit);
  unitRef.current = unit;
  const previewSizeRef = useRef(previewSize);
  previewSizeRef.current = previewSize;
  const audioRunningRef = useRef(false);
  audioRunningRef.current = audioInfo.isRunning;
  const simActiveRef = useRef(false);
  simActiveRef.current = simEnabled || isReplaying;
  const simSpeedRef = useRef(0);
  simSpeedRef.current = simSpeedMph;

  // --- Persist calibration so the user doesn't recalibrate every drive. ---
  useEffect(() => {
    (async () => {
      try {
        const [storedBox, storedUnit] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.cropBox),
          AsyncStorage.getItem(STORAGE_KEYS.unit),
        ]);
        if (storedBox) {
          const parsed = JSON.parse(storedBox) as CropBox;
          if (isValidCropBox(parsed)) setCropBox(parsed);
        }
        if (storedUnit === 'mph' || storedUnit === 'kmh') setUnit(storedUnit);
      } catch {
        // corrupted storage — fall back to defaults
      }
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEYS.cropBox, JSON.stringify(cropBox)).catch(() => {});
    }, 400); // debounce: dragging fires many updates
    return () => clearTimeout(t);
  }, [cropBox]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEYS.unit, unit).catch(() => {});
  }, [unit]);

  // --- OCR loop: capture → crop → OCR → parse → filter, every ~500 ms. ---
  useEffect(() => {
    if (!isReading || !cameraReady) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      const started = Date.now();
      try {
        const cam = cameraRef.current;
        const preview = previewSizeRef.current;
        if (cam && preview.width > 0 && preview.height > 0) {
          const photo = await cam.takePictureAsync({
            quality: 0.4,
            exif: false,
            shutterSound: false,
          });
          if (photo?.uri && !cancelled) {
            const prevMph = speedFilter.getCurrentSpeed().speedMph;
            const reading = await speedReader.readSpeed({
              photoUri: photo.uri,
              photoWidth: photo.width,
              photoHeight: photo.height,
              previewWidth: preview.width,
              previewHeight: preview.height,
              cropBox: cropBoxRef.current,
              // parseSpeedFromText compares against what the screen displays
              previousDisplayedSpeed: displayUnitValue(prevMph, unitRef.current),
            });
            const snap = speedFilter.update(reading, unitRef.current);
            if (!cancelled) {
              setLastReading(reading);
              setFilterSnap(snap);
            }
          }
        }
      } catch {
        // capture/OCR hiccup — skip this frame, the filter tolerates gaps
      }
      if (!cancelled) {
        const elapsed = Date.now() - started;
        timer = setTimeout(tick, Math.max(100, READ_INTERVAL_MS - elapsed));
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isReading, cameraReady, speedFilter, speedReader]);

  // --- Engine loop: speed (camera or simulated) → simulator → audio, every 250 ms. ---
  useEffect(() => {
    if (!isReading && !audioInfo.isRunning && !simEnabled && !isReplaying) return;
    const id = setInterval(() => {
      const now = Date.now();
      const speedMph = simActiveRef.current
        ? simSpeedRef.current
        : speedFilter.getCurrentSpeed(now).speedMph;
      const state = simulator.update({ speed: speedMph, unit: 'mph', timestamp: now });
      setEngineState(state);
      setFilterSnap(speedFilter.getSnapshot(now)); // keeps the stale flag live during OCR gaps
      if (audioRunningRef.current) {
        EngineAudio.update(state);
      }
    }, ENGINE_TICK_MS);
    return () => clearInterval(id);
  }, [isReading, audioInfo.isRunning, simEnabled, isReplaying, simulator, speedFilter]);

  // --- Recorded-drive replay: step the simulated speed through a real trace. ---
  useEffect(() => {
    if (!isReplaying) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const mph = sampleDriveSpeedAt(Date.now() - startedAt);
      if (mph == null) {
        setIsReplaying(false);
        setSimSpeedMph(0);
      } else {
        setSimSpeedMph(mph);
      }
    }, 250);
    return () => clearInterval(id);
  }, [isReplaying]);

  const handleStartEngine = useCallback(async () => {
    const info = await EngineAudio.start();
    setAudioInfo(info);
  }, []);

  const handleStopEngine = useCallback(() => {
    setAudioInfo(EngineAudio.stop());
  }, []);

  // --- Permission gates. ---
  if (!permission) {
    return <Centered message="Checking camera permission…" />;
  }
  if (!permission.granted) {
    return (
      <Centered message="EngineCam needs the camera to read your Tesla's speed display.">
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>
            {permission.canAskAgain ? 'Grant camera access' : 'Enable camera in Settings'}
          </Text>
        </TouchableOpacity>
      </Centered>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.cameraArea}>
        <CameraPreviewWithCropBox
          cameraRef={cameraRef}
          cropBox={cropBox}
          previewWidth={previewSize.width}
          previewHeight={previewSize.height}
          onCropBoxChange={setCropBox}
          onPreviewLayout={setPreviewSize}
          onCameraReady={() => setCameraReady(true)}
        />
        <Text style={styles.cameraHint}>Drag the box over the Tesla speed number</Text>
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        {/* Unit selector */}
        <View style={styles.unitRow}>
          {(['mph', 'kmh'] as SpeedUnit[]).map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.unitButton, unit === u && styles.unitButtonActive]}
              onPress={() => setUnit(u)}
            >
              <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>
                {u === 'kmh' ? 'km/h' : 'mph'}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.readButton, isReading ? styles.readButtonStop : styles.readButtonStart]}
            onPress={() => setIsReading((r) => !r)}
            disabled={!cameraReady}
          >
            <Text style={styles.readButtonText}>
              {isReading ? 'Stop Reading' : 'Start Reading'}
            </Text>
          </TouchableOpacity>
        </View>

        <EngineDashboard
          unit={unit}
          filteredSpeedMph={
            simEnabled || isReplaying ? simSpeedMph : (filterSnap?.filteredSpeedMph ?? null)
          }
          isStale={simEnabled || isReplaying ? false : (filterSnap?.isStale ?? true)}
          engineState={engineState}
          audioInfo={audioInfo}
          onStartEngine={handleStartEngine}
          onStopEngine={handleStopEngine}
        />

        <DebugSpeedControls
          unit={unit}
          simEnabled={simEnabled}
          simSpeedMph={simSpeedMph}
          isReplaying={isReplaying}
          onSimEnabledChange={(enabled) => {
            setSimEnabled(enabled);
            if (!enabled) setSimSpeedMph(0);
          }}
          onSimSpeedChange={setSimSpeedMph}
          onToggleReplay={() => {
            setIsReplaying((r) => {
              if (r) setSimSpeedMph(0);
              return !r;
            });
          }}
        />

        <DebugPanel
          reading={lastReading}
          filter={filterSnap}
          unit={unit}
          engineState={engineState}
          audioInfo={audioInfo}
          ocrEngineName={speedReader.ocrEngineName}
          ocrAvailable={speedReader.ocrAvailable}
          ocrError={speedReader.lastError}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Centered({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.centeredText}>{message}</Text>
      {children}
    </View>
  );
}

function isValidCropBox(box: unknown): box is CropBox {
  if (typeof box !== 'object' || box == null) return false;
  const b = box as Record<string, unknown>;
  return (['x', 'y', 'width', 'height'] as const).every(
    (k) => typeof b[k] === 'number' && Number.isFinite(b[k] as number)
  );
}

function displayUnitValue(mph: number, unit: SpeedUnit): number {
  return unit === 'kmh' ? mph * 1.609344 : mph;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14' },
  cameraArea: { height: '42%' },
  cameraHint: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    color: '#fff',
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  panel: { flex: 1 },
  panelContent: { padding: 12 },
  unitRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'stretch' },
  unitButton: {
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#1c242e',
  },
  unitButtonActive: { backgroundColor: '#2f81f7' },
  unitText: { color: '#9aa7b4', fontWeight: '700' },
  unitTextActive: { color: '#fff' },
  readButton: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  readButtonStart: { backgroundColor: '#2f81f7' },
  readButtonStop: { backgroundColor: '#8a5b00' },
  readButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  centered: {
    flex: 1,
    backgroundColor: '#0b0f14',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 20,
  },
  centeredText: { color: '#c8d2dc', fontSize: 16, textAlign: 'center', lineHeight: 22 },
  permissionButton: {
    backgroundColor: '#2f81f7',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permissionButtonText: { color: '#fff', fontWeight: '700' },
});
