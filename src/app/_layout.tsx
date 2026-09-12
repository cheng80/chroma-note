import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
