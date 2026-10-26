import {
  BigShouldersDisplay_700Bold,
  BigShouldersDisplay_800ExtraBold,
  BigShouldersDisplay_900Black,
  useFonts,
} from '@expo-google-fonts/big-shoulders-display';

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
          BigShouldersDisplay_700Bold,
          BigShouldersDisplay_800ExtraBold,
          BigShouldersDisplay_900Black,
        },
  );
  return true;
}
