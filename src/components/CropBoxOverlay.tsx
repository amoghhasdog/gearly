import React, { useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { CropBox } from '../types/speed';

interface Props {
  cropBox: CropBox; // normalized 0..1 relative to the preview
  previewWidth: number;
  previewHeight: number;
  onChange: (box: CropBox) => void;
}

const MIN_SIZE = 0.06; // normalized minimum width/height
const HANDLE_SIZE = 36;

/**
 * Draggable + resizable crop box drawn over the camera preview. Drag the body
 * to move it; drag the bottom-right handle to resize. Coordinates stay
 * normalized (0..1) so they survive preview resizes and persist cleanly.
 */
export default function CropBoxOverlay({ cropBox, previewWidth, previewHeight, onChange }: Props) {
  // Latest props readable from inside the PanResponders (created once).
  const latest = useRef({ cropBox, previewWidth, previewHeight, onChange });
  latest.current = { cropBox, previewWidth, previewHeight, onChange };

  const dragStart = useRef<CropBox>(cropBox);

  const moveResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = latest.current.cropBox;
      },
      onPanResponderMove: (_evt, gesture) => {
        const { previewWidth: pw, previewHeight: ph, onChange: emit } = latest.current;
        if (pw <= 0 || ph <= 0) return;
        const start = dragStart.current;
        const x = clamp(start.x + gesture.dx / pw, 0, 1 - start.width);
        const y = clamp(start.y + gesture.dy / ph, 0, 1 - start.height);
        emit({ ...start, x, y });
      },
    })
  ).current;

  const resizeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = latest.current.cropBox;
      },
      onPanResponderMove: (_evt, gesture) => {
        const { previewWidth: pw, previewHeight: ph, onChange: emit } = latest.current;
        if (pw <= 0 || ph <= 0) return;
        const start = dragStart.current;
        const width = clamp(start.width + gesture.dx / pw, MIN_SIZE, 1 - start.x);
        const height = clamp(start.height + gesture.dy / ph, MIN_SIZE, 1 - start.y);
        emit({ ...start, width, height });
      },
    })
  ).current;

  if (previewWidth <= 0 || previewHeight <= 0) return null;

  const px = {
    left: cropBox.x * previewWidth,
    top: cropBox.y * previewHeight,
    width: cropBox.width * previewWidth,
    height: cropBox.height * previewHeight,
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.box, px]} {...moveResponder.panHandlers}>
        <Text style={styles.label}>SPEED</Text>
        <View style={styles.resizeHandle} {...resizeResponder.panHandlers}>
          <View style={styles.resizeGlyph} />
        </View>
      </View>
    </View>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#ff4444',
    backgroundColor: 'rgba(255,68,68,0.08)',
    borderRadius: 4,
  },
  label: {
    position: 'absolute',
    top: -20,
    left: 0,
    color: '#ff4444',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  resizeHandle: {
    position: 'absolute',
    right: -HANDLE_SIZE / 2,
    bottom: -HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeGlyph: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ff4444',
    borderWidth: 2,
    borderColor: '#fff',
  },
});
