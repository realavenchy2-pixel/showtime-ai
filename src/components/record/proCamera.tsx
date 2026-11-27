import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useCamPrefs } from '@/lib/camPrefs';
import { haptic } from '@/lib/haptics';
import { timecode, type Size } from '@/media/procam';

import { FrameLines, HudBar, LensSlider, ToolRail, type ProCameraInput, type ProCameraParts, type RailItem } from './Viewfinder';

// The pro camera in the phone app. Expo's camera gives us zoom and the light but not the picture
// itself, so zebras, peaking and scopes wait for the native camera module (VisionCamera); the
// frame lines, aim, thirds and timecode are here now.

/** The phone app records at 30 frames a second. */
const FPS = 30;

export function useProCamera(input: ProCameraInput): ProCameraParts {
  const { recording, elapsedSec, hidden } = input;
  const prefs = useCamPrefs();
  const dims = useWindowDimensions();
  const [box, setBox] = useState<Size>({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(0);
  const [torch, setTorch] = useState(false);
  const [open, setOpen] = useState(false);
  // The camera view fills the screen, so the frame lines sit at its edges.
  const frame = { x: 0, y: 0, w: box.w, h: box.h };

  const items: RailItem[] = [
    {
      key: 'pro',
      label: 'Pro',
      on: prefs.pro,
      hint: 'Pro camera: frame lines, the aim and timecode',
      onPress: () => {
        haptic.select();
        prefs.toggle('pro');
      },
    },
  ];
  if (prefs.pro) {
    items.push(
      {
        key: 'grid',
        label: 'Grid',
        on: prefs.grid,
        hint: 'Rule of thirds grid',
        onPress: () => {
          haptic.select();
          prefs.toggle('grid');
        },
      },
      { key: 'zoom', label: `${Math.round(zoom * 100)}%`, on: open, hint: `Zoom, ${Math.round(zoom * 100)} percent`, onPress: () => setOpen(!open) },
      {
        key: 'light',
        label: 'Light',
        on: torch,
        hint: 'Phone light',
        onPress: () => {
          haptic.select();
          setTorch(!torch);
        },
      },
    );
  }

  const viewfinder = hidden ? null : (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {prefs.pro && box.w ? <FrameLines frame={frame} grid={prefs.grid} /> : null}
    </View>
  );

  const tools = hidden ? null : (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <ToolRail items={items} top={dims.height * 0.24} maxHeight={dims.height * 0.3} />
      {prefs.pro && open ? <LensSlider label="Zoom" value={zoom} min={0} max={1} top={dims.height * 0.24} format={(v) => `${Math.round(v * 100)}%`} onChange={setZoom} /> : null}
    </View>
  );

  return {
    fit: 'cover',
    viewfinder,
    status: prefs.pro ? <HudBar recording={recording} code={timecode(recording ? elapsedSec : 0, FPS)} /> : undefined,
    tools,
    zoom: prefs.pro ? zoom : 0,
    torch: prefs.pro && torch,
  };
}
