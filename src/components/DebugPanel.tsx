import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AudioInfo, EngineState } from '../types/engine';
import { FilterSnapshot, SpeedReading, SpeedUnit } from '../types/speed';

interface Props {
  reading: SpeedReading | null;
  filter: FilterSnapshot | null;
  unit: SpeedUnit;
  engineState: EngineState | null;
  audioInfo: AudioInfo;
  ocrEngineName: string;
  ocrAvailable: boolean;
  ocrError: string | null;
}

/** Raw OCR / filter / engine internals, for calibrating and debugging. */
export default function DebugPanel({
  reading,
  filter,
  unit,
  engineState,
  audioInfo,
  ocrEngineName,
  ocrAvailable,
  ocrError,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>DEBUG</Text>

      <Row label="OCR engine" value={`${ocrEngineName}${ocrAvailable ? '' : ' — UNAVAILABLE (dev build required)'}`} warn={!ocrAvailable} />
      {ocrError != null && <Row label="OCR error" value={ocrError} warn />}
      <Row label="Raw OCR text" value={reading ? JSON.stringify(reading.rawText) : '-'} />
      <Row label="Parsed speed" value={reading?.parsedSpeed != null ? `${reading.parsedSpeed} ${unit}` : '-'} />
      <Row label="OCR status" value={reading?.status ?? '-'} />
      <Row
        label="Filtered speed"
        value={filter?.filteredSpeedMph != null ? `${filter.filteredSpeedMph.toFixed(1)} mph` : '-'}
      />
      <Row label="Unit" value={unit === 'kmh' ? 'km/h' : 'mph'} />
      <Row
        label="Last valid at"
        value={
          filter?.lastValidTimestamp != null
            ? new Date(filter.lastValidTimestamp).toLocaleTimeString()
            : 'never'
        }
      />
      <Row label="Signal" value={filter ? (filter.isStale ? 'STALE' : 'active') : '-'} warn={filter?.isStale} />
      <Row label="Rejected count" value={String(filter?.rejectedCount ?? 0)} />
      <Row label="Last rejection" value={filter?.lastRejectionReason ?? '-'} />
      <Row label="Fake gear" value={engineState ? String(engineState.virtualGear) : '-'} />
      <Row label="Virtual RPM" value={engineState ? String(engineState.virtualRPM) : '-'} />
      <Row
        label="Accel estimate"
        value={engineState ? `${engineState.accelerationEstimate.toFixed(1)} mph/s` : '-'}
      />
      <Row label="Audio status" value={audioInfo.status} warn={audioInfo.status === 'unavailable' || audioInfo.status === 'error'} />
      {audioInfo.missingSounds.length > 0 && (
        <Row label="Missing sounds" value={audioInfo.missingSounds.join(', ')} warn />
      )}
      {audioInfo.lastError != null && <Row label="Audio error" value={audioInfo.lastError} warn />}
    </View>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, warn && styles.warn]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#10151c',
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
  },
  title: { color: '#9aa7b4', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    gap: 12,
  },
  label: { color: '#6b7683', fontSize: 12 },
  value: { color: '#c8d2dc', fontSize: 12, fontFamily: 'Courier', flexShrink: 1, textAlign: 'right' },
  warn: { color: '#f3b53c' },
});
