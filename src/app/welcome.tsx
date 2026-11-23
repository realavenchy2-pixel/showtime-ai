import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { LoopVideo } from '@/components/LoopVideo';
import { T } from '@/components/T';
import { useApp } from '@/engine/store';
import { HERO_WIPE, SWITCH_EXAMPLES } from '@/lib/examples';
import { color, gutter, maxWidth, radius, space } from '@/theme/tokens';

/** First open: a real before and after, playing. Every video is paid, so people see it work first. */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const markWelcomed = useApp((s) => s.markWelcomed);
  return (
    <View style={styles.page}>
      <LoopVideo source={HERO_WIPE} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.85)', 'rgba(0,0,0,0.97)']} locations={[0, 0.16, 0.42, 0.7, 1]} style={StyleSheet.absoluteFill} />
      <View style={[styles.top, { paddingTop: insets.top + space.m }]}>
        <Image source={require('../../assets/images/logo-lockup.png')} style={styles.logo} contentFit="contain" accessibilityLabel="Showtime AI" />
        <View style={styles.inset}>
          <Image source={SWITCH_EXAMPLES[0].before} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.insetChip}>
            <T v="micro">Shot here</T>
          </View>
        </View>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.l }]}>
        <T v="micro" c="accentText" style={styles.center}>
          Real Showtime switch, frame for frame
        </T>
        <T v="display" style={styles.center}>
          Shot in a bedroom.
        </T>
        <T v="body" c="smoke" style={styles.center}>
          Record yourself anywhere. Showtime switches the location, grades it like a cinema camera and cuts the video.
        </T>
        <Button
          label="Get started"
          onPress={() => {
            markWelcomed();
            router.replace('/paywall');
          }}
        />
        <Button label="See what it can do" variant="quiet" onPress={() => router.push('/examples')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.stage },
  top: { paddingHorizontal: gutter, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { width: 120, height: 36 },
  inset: { width: 92, height: 128, borderRadius: radius.m, overflow: 'hidden', borderWidth: 3, borderColor: '#FFFFFF', transform: [{ rotate: '5deg' }], marginTop: space.xl },
  insetChip: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.s, backgroundColor: color.scrim },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: gutter, gap: space.m, width: '100%', maxWidth, alignSelf: 'center' },
  center: { textAlign: 'center' },
});
