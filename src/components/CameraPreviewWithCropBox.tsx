import { CameraView } from 'expo-camera';
import React, { RefObject } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { CropBox } from '../types/speed';
import CropBoxOverlay from './CropBoxOverlay';

interface Props {
  cameraRef: RefObject<CameraView | null>;
  cropBox: CropBox;
  previewWidth: number;
  previewHeight: number;
  onCropBoxChange: (box: CropBox) => void;
  onPreviewLayout: (size: { width: number; height: number }) => void;
  onCameraReady: () => void;
}

/**
 * Live rear-camera preview with the calibration crop box on top. The preview
 * stays mounted for the whole session — OCR captures come from this camera.
 */
export default function CameraPreviewWithCropBox({
  cameraRef,
  cropBox,
  previewWidth,
  previewHeight,
  onCropBoxChange,
  onPreviewLayout,
  onCameraReady,
}: Props) {
  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    onPreviewLayout({ width, height });
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        animateShutter={false}
        onCameraReady={onCameraReady}
      />
      <CropBoxOverlay
        cropBox={cropBox}
        previewWidth={previewWidth}
        previewHeight={previewHeight}
        onChange={onCropBoxChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#000' },
});
