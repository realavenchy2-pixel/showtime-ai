import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Haptics only for meaning: selections, confirmations, finished jobs. Never on plain taps.

const native = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptic = {
  select() {
    if (native) Haptics.selectionAsync().catch(() => {});
  },
  confirm() {
    if (native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  success() {
    if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  beat() {
    if (native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
  },
};
