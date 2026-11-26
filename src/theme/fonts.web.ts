import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold, useFonts } from '@expo-google-fonts/sora';

declare global {
  interface Window {
    /** Set by the hosted web preview, which embeds the fonts in the page itself. */
    __SHOWTIME_EMBEDDED_FONTS__?: boolean;
  }
}

const embedded = typeof window !== 'undefined' && window.__SHOWTIME_EMBEDDED_FONTS__ === true;

/** On the web the app never waits for fonts: text swaps to the display face when it arrives. */
export function useAppFonts(): boolean {
  useFonts(
    embedded
      ? {}
      : {
          Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
        },
  );
  return true;
}
