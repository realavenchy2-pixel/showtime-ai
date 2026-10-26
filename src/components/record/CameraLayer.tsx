import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { StyleSheet } from 'react-native';

/** Camera and mic access, asked for at the moment the artist starts recording. */
export function useCameraAccess() {
  const [camera, requestCamera] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  return {
    loading: camera === null || mic === null,
    granted: !!camera?.granted && !!mic?.granted,
    canAsk: (camera?.canAskAgain ?? true) && (mic?.canAskAgain ?? true),
    request: async () => {
      const c = await requestCamera();
      const m = await requestMic();
      return c.granted && m.granted;
    },
  };
}

/** Live preview from the front camera. The prototype records takes as data, not files. */
export function CameraLayer({ facing }: { facing: 'front' | 'back'; showHint?: boolean }) {
  return <CameraView style={StyleSheet.absoluteFill} facing={facing} mode="video" mirror={facing === 'front'} />;
}
