import { Asset } from 'expo-asset';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color } from '@/theme/tokens';

/** Web: a plain muted, looping <video> that fills its box. */
export function LoopVideo({ source, style, fit = 'cover' }: { source: number; style?: StyleProp<ViewStyle>; fit?: 'cover' | 'contain' }) {
  const uri = Asset.fromModule(source).uri;
  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <video
        src={uri}
        muted
        loop
        autoPlay
        playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, display: 'block' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: color.flat },
});
