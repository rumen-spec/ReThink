import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { OwnerProvider } from '@/components/owner-provider';
import { T } from '@/constants/theme';
// Imported for its side effect: the geofencing task must be defined before iOS can relaunch the
// app into it in the background (SPEC §14).
import '@/lib/geofence';
import '@/lib/push';

SplashScreen.preventAutoHideAsync();

// Dark-first and locked (tokens in constants/theme.ts). System typeface, so nothing to load before first paint.
const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: T.accent, background: T.canvas, card: T.surface, text: T.ink, border: T.hairline, notification: T.coral },
};

/** Root: a stack with the three tabs as one screen and the edit page as an iOS sheet (SPEC §1.3: editors are sub-screens, never tabs). */
export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: T.canvas }}>
      <ThemeProvider value={theme}>
        <StatusBar barStyle="light-content" />
        <OwnerProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.canvas } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="edit" options={{ presentation: 'modal', contentStyle: { backgroundColor: T.canvas } }} />
          </Stack>
        </OwnerProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
