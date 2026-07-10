import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AudioInfo, EngineState } from '../types/engine';
import { SpeedUnit } from '../types/speed';
import { formatSpeed } from '../modules/UnitConverter';

interface Props {
  unit: SpeedUnit;
  filteredSpeedMph: number | null;
  isStale: boolean;
  engineState: EngineState | null;
  audioInfo: AudioInfo;
  onStartEngine: () => void;
  onStopEngine: () => void;
}

const MAX_RPM = 7000;

/** Main dashboard: detected speed, fake gear/RPM, audio status and controls. */
export default function EngineDashboard({
  unit,
  filteredSpeedMph,
  isStale,
  engineState,
  audioInfo,
  onStartEngine,
  onStopEngine,
}: Props) {
  const rpm = engineState?.virtualRPM ?? 0;
  const rpmFraction = Math.min(1, rpm / MAX_RPM);

  return (
    <View style={styles.card}>
      <View style={styles.speedRow}>
        <Text style={[styles.speedValue, isStale && styles.staleText]}>
          {formatSpeed(filteredSpeedMph, unit)}
        </Text>
        {isStale && <Text style={styles.staleBadge}>STALE</Text>}
      </View>

      <View style={styles.statsRow}>
        <Stat label="GEAR" value={engineState ? String(engineState.virtualGear) : '-'} />
        <Stat label="RPM" value={engineState ? String(engineState.virtualRPM) : '-'} />
        <Stat
          label="STATE"
          value={
            !engineState
              ? '-'
              : engineState.isAccelerating
                ? 'ACCEL'
                : engineState.isDecelerating
                  ? 'DECEL'
                  : engineState.speedMph < 0.5
                    ? 'IDLE'
                    : 'CRUISE'
          }
        />
      </View>

      <View style={styles.rpmBarTrack}>
        <View
          style={[
            styles.rpmBarFill,
            { width: `${rpmFraction * 100}%` },
            rpmFraction > 0.85 && styles.rpmBarRedline,
          ]}
        />
      </View>

      <Text style={styles.audioStatus}>
        Audio: {audioInfo.status}
        {audioInfo.isRunning ? ' · playing' : ''}
        {audioInfo.missingSounds.length > 0 ? ` · missing: ${audioInfo.missingSounds.join(', ')}` : ''}
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.startButton, audioInfo.isRunning && styles.buttonDisabled]}
          onPress={onStartEngine}
          disabled={audioInfo.isRunning}
        >
          <Text style={styles.buttonText}>Start Engine Sound</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.stopButton, !audioInfo.isRunning && styles.buttonDisabled]}
          onPress={onStopEngine}
          disabled={!audioInfo.isRunning}
        >
          <Text style={styles.buttonText}>Stop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141a22',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  speedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  speedValue: { color: '#fff', fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'] },
  staleText: { color: '#6b7683' },
  staleBadge: {
    color: '#f3b53c',
    fontSize: 12,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: '#f3b53c',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  stat: { alignItems: 'center' },
  statLabel: { color: '#9aa7b4', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  statValue: { color: '#fff', fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rpmBarTrack: {
    height: 10,
    backgroundColor: '#242d38',
    borderRadius: 5,
    marginTop: 14,
    overflow: 'hidden',
  },
  rpmBarFill: { height: '100%', backgroundColor: '#2f81f7', borderRadius: 5 },
  rpmBarRedline: { backgroundColor: '#ff4444' },
  audioStatus: { color: '#9aa7b4', fontSize: 12, marginTop: 10, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  startButton: { backgroundColor: '#1f883d' },
  stopButton: { backgroundColor: '#b62324' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
