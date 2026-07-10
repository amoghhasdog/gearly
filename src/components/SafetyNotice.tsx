import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  onContinue: () => void;
}

/** First screen: safety notice the user must acknowledge before anything else. */
export default function SafetyNotice({ onContinue }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.title}>EngineCam</Text>
      <Text style={styles.body}>
        Mount your phone securely before driving.{'\n\n'}
        Do not interact with the app while driving.{'\n\n'}
        Start the app before moving.
      </Text>
      <Text style={styles.sub}>
        Connect your phone to your Tesla over Bluetooth so the engine sound plays through the car
        speakers.
      </Text>
      <TouchableOpacity style={styles.button} onPress={onContinue} accessibilityRole="button">
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f14',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { color: '#fff', fontSize: 32, fontWeight: '800', marginBottom: 24 },
  body: { color: '#f3b53c', fontSize: 18, fontWeight: '600', textAlign: 'center', lineHeight: 24 },
  sub: { color: '#9aa7b4', fontSize: 14, textAlign: 'center', marginTop: 24, lineHeight: 20 },
  button: {
    marginTop: 40,
    backgroundColor: '#2f81f7',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
