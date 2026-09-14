import React, { useId, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SemanticText } from './SemanticText';
import { theme } from '../theme';
import type { DisplayLocale } from '../contract';

function rgbToHsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const v = Math.max(r, g, b), min = Math.min(r, g, b), d = v - min;
  let h = d === 0 ? 0 : v === r ? ((g - b) / d) % 6 : v === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: v === 0 ? 0 : d / v, v };
}
export function hsvToHex(h: number, s: number, v: number) {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + rgb.map(value => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Tap hue, then shade. The hit surface covers the entire gradient. */
export function ColorPalettePicker({ hex, locale, onSelect }: { hex: string; locale: DisplayLocale; onSelect: (hex: string) => void }) {
  const [hue, setHue] = useState(() => rgbToHsv(hex).h);
  const latestHue = useRef(hue);
  const [width, setWidth] = useState(1);
  const { s, v } = rgbToHsv(hex);
  const id = useId().replace(/:/g, '');
  const fraction = (event: GestureResponderEvent) => Math.max(0, Math.min(1, event.nativeEvent.locationX / width));
  const selectHue = (event: GestureResponderEvent) => {
    const next = Math.min(359.999, fraction(event) * 360);
    latestHue.current = next;
    setHue(next);
    onSelect(hsvToHex(next, s || 0.65, v || 0.8));
  };
  return <View style={styles.container} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <SemanticText style={styles.hint}>{locale === 'ko' ? '아래에서 색을 고르고, 위에서 밝기와 진하기를 골라요.' : 'Choose a hue below, then tap a shade above.'}</SemanticText>
    <Pressable accessibilityRole="button" accessibilityLabel={locale === 'ko' ? '색의 밝기와 진하기 고르기' : 'Choose a color shade'} onPress={event => onSelect(hsvToHex(latestHue.current, fraction(event), 1 - Math.max(0, Math.min(1, event.nativeEvent.locationY / 148))))} style={styles.shades}>
      <Svg width="100%" height="100%" pointerEvents="none"><Defs><LinearGradient id={`${id}white`}><Stop offset="0" stopColor="#FFFFFF" /><Stop offset="1" stopColor={hsvToHex(hue, 1, 1)} /></LinearGradient><LinearGradient id={`${id}black`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#000000" stopOpacity="0" /><Stop offset="1" stopColor="#000000" /></LinearGradient></Defs><Rect width="100%" height="100%" fill={`url(#${id}white)`} /><Rect width="100%" height="100%" fill={`url(#${id}black)`} /></Svg>
      <View pointerEvents="none" style={[styles.marker, { left: Math.max(2, Math.min(width - 22, s * width - 10)), top: Math.max(2, Math.min(126, (1 - v) * 148 - 10)) }]} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={locale === 'ko' ? '팔레트 색 고르기' : 'Choose a hue'} onPress={selectHue} style={styles.hue}>
      <Svg width="100%" height="24" pointerEvents="none"><Defs><LinearGradient id={`${id}hue`}>{['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'].map((color, i) => <Stop key={i} offset={i / 6} stopColor={color} />)}</LinearGradient></Defs><Rect width="100%" height="24" rx="12" fill={`url(#${id}hue)`} /></Svg>
      <View pointerEvents="none" style={[styles.hueMarker, { left: Math.max(0, Math.min(width - 12, hue / 360 * width - 6)) }]} />
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 8 }, hint: { color: theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  shades: { height: 148, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderControl },
  hue: { minHeight: 48, justifyContent: 'center' },
  marker: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: 'transparent', shadowColor: '#000000', shadowOpacity: 0.7, shadowRadius: 2, shadowOffset: { width: 0, height: 0 } },
  hueMarker: { position: 'absolute', top: 8, width: 12, height: 32, borderRadius: 6, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: 'transparent', shadowColor: '#000000', shadowOpacity: 0.7, shadowRadius: 2, shadowOffset: { width: 0, height: 0 } },
});
