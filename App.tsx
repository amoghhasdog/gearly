import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SafetyNotice from './src/components/SafetyNotice';
import MainScreen from './src/screens/MainScreen';

export default function App() {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {acknowledged ? <MainScreen /> : <SafetyNotice onContinue={() => setAcknowledged(true)} />}
    </SafeAreaProvider>
  );
}
