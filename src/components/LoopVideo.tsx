import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color } from '@/theme/tokens';

/** A short clip that plays on its own: muted, looping, no controls. For previews and examples. */
export function LoopVideo({ source, style, fit = 'cover' }: { source: number; style?: StyleProp<ViewStyle>; fit?: 'cover' | 'contain' }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: color.flat },
});
