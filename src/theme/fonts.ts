import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold, useFonts } from '@expo-google-fonts/sora';

/** Loads Sora and Inter. Returns true once text can render in it. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
  });
  // A failed load falls back to the system font rather than blocking the app.
  return loaded || !!error;
}
