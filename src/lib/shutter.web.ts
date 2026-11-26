import { Asset } from 'expo-asset';

let audio: HTMLAudioElement | undefined;

/** The camera shutter, when the artist picks a camera. */
export function playShutter(): void {
  try {
    if (!audio) audio = new Audio(Asset.fromModule(require('../../assets/sounds/shutter.wav')).uri);
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    // Sound is a nicety; never block the pick.
  }
}
