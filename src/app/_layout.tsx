import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { ToastHost } from '@/components/Toast';
import { useApp } from '@/engine/store';
import { useAppFonts } from '@/theme/fonts';
import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: color.stage,
    card: color.curtain,
    text: color.chalk,
    border: color.hairline,
    primary: color.tungsten,
    notification: color.tungsten,
  },
};

/** Drives the simulated jobs. Phase 2 replaces this with webhooks from the job queue. */
function useJobTicker() {
  useEffect(() => {
    const step = 200;
    const timer = setInterval(() => useApp.getState().tick(step), step);
    return () => clearInterval(timer);
  }, []);
}

export default function RootLayout() {
  const fontsReady = useAppFonts();
  useJobTicker();

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: color.stage }} />;

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.stage } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="project/[id]/index" />
        <Stack.Screen name="project/[id]/[stage]" />
        <Stack.Screen name="project/[id]/record" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="tutorial/[stage]" options={{ presentation: 'modal' }} />
      </Stack>
      <ToastHost />
    </ThemeProvider>
  );
}
