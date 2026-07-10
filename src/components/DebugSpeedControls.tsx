import Slider from '@react-native-community/slider';
import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SpeedUnit } from '../types/speed';
import { formatSpeed } from '../modules/UnitConverter';

interface Props {
  unit: SpeedUnit;
  simEnabled: boolean;
  simSpeedMph: number;
  isReplaying: boolean;
  onSimEnabledChange: (enabled: boolean) => void;
  onSimSpeedChange: (mph: number) => void;
  onToggleReplay: () => void;
}

/**
 * Debug-only speed source: a manual slider and a replay of a real recorded
 * drive. Lets you hear the full engine behavior (gears, shifts, RPM, decel)
 * without a car — and in Expo Go, where OCR isn't available at all.
 */
export default function DebugSpeedControls({
  unit,
  simEnabled,
  simSpeedMph,
  isReplaying,
  onSimEnabledChange,
  onSimSpeedChange,
  onToggleReplay,
}: Props) {
  const active = simEnabled || isReplaying;
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>SIMULATED SPEED (DEBUG)</Text>
        <Switch
          value={simEnabled}
          onValueChange={onSimEnabledChange}
          disabled={isReplaying}
          trackColor={{ true: '#2f81f7', false: '#3a4653' }}
        />
      </View>

      {active && (
        <Text style={styles.speedText}>{formatSpeed(simSpeedMph, unit)}</Text>
      )}

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={simSpeedMph}
        onValueChange={onSimSpeedChange}
        disabled={!simEnabled || isReplaying}
        minimumTrackTintColor="#2f81f7"
        maximumTrackTintColor="#3a4653"
        thumbTintColor={simEnabled && !isReplaying ? '#2f81f7' : '#5a6673'}
      />

      <TouchableOpacity
        style={[styles.replayButton, isReplaying && styles.replayButtonActive]}
        onPress={onToggleReplay}
      >
        <Text style={styles.replayText}>
          {isReplaying ? 'Stop replay' : 'Replay recorded drive (0→54 mph)'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        {active
          ? 'Camera speed is ignored while simulation is on.'
          : 'Turn on to test engine sound without OCR / a car.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#151b13',
    borderColor: '#2c3a26',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#9ab48a', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  speedText: {
    color: '#c4e8ae',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  slider: { width: '100%', height: 36, marginTop: 4 },
  replayButton: {
    backgroundColor: '#24321e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  replayButtonActive: { backgroundColor: '#8a5b00' },
  replayText: { color: '#c4e8ae', fontWeight: '700', fontSize: 14 },
  hint: { color: '#6b7683', fontSize: 11, textAlign: 'center', marginTop: 8 },
});
