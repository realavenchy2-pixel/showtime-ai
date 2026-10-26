import {
  BigShouldersDisplay_700Bold,
  BigShouldersDisplay_800ExtraBold,
  BigShouldersDisplay_900Black,
  useFonts,
} from '@expo-google-fonts/big-shoulders-display';

/** Loads the display face. Returns true once text can render in it. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    BigShouldersDisplay_700Bold,
    BigShouldersDisplay_800ExtraBold,
    BigShouldersDisplay_900Black,
  });
  // A failed load falls back to the system font rather than blocking the app.
  return loaded || !!error;
}
