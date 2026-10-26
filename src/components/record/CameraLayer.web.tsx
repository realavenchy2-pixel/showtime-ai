import { StyleSheet, View } from 'react-native';

import { SceneArt } from '../art/SceneArt';
import { T } from '../T';
import { color, radius, space } from '@/theme/tokens';

/** The web preview has no camera, so it shows a stand-in take. */
export function useCameraAccess() {
  return { loading: false, granted: true, canAsk: true, request: async () => true };
}

export function CameraLayer({ showHint = true }: { facing: 'front' | 'back'; showHint?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <SceneArt kind="room" relit={false} />
      {showHint ? (
        <View style={styles.note}>
          <T v="micro" c="smoke">
            Camera preview runs on your phone
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    position: 'absolute',
    top: '42%',
    alignSelf: 'center',
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
    borderRadius: radius.s,
    backgroundColor: color.scrim,
  },
});
