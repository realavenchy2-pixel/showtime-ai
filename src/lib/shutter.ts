import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

let player: AudioPlayer | undefined;

/** The camera shutter, when the artist picks a camera. */
export function playShutter(): void {
  try {
    if (!player) player = createAudioPlayer(require('../../assets/sounds/shutter.wav'));
    void player.seekTo(0);
    player.play();
  } catch {
    // Sound is a nicety; never block the pick.
  }
}
