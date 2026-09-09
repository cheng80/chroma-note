import React, { useEffect, useRef, useState } from 'react';
import Reanimated from 'react-native-reanimated';
import { AccessibilityInfo, Animated, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconButton, StampImage } from '../primitives';
import { AppIcon } from './AppIcon';
import { usePressScale } from './motion';
import { theme } from '../theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

export function RecordCard({ date, title, source, onPress, onToggleFavorite, isFavorite = false, favoriteLabel = 'Favorite', accessibilityLabel, width }: { date: string; title: string; source: ImageSourcePropType; onPress: () => void; onToggleFavorite?: () => void; isFavorite?: boolean; favoriteLabel?: string; accessibilityLabel: string; width?: number }) {
  const [pulse] = useState(() => new Animated.Value(1));
  const firstRender = useRef(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const { animatedStyle, setPressed } = usePressScale();
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion); const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion); return () => subscription.remove(); }, []);
  useEffect(() => { if (firstRender.current) { firstRender.current = false; return; } Animated.sequence([Animated.timing(pulse, { toValue: reduceMotion ? 1 : 0.25, duration: reduceMotion ? 0 : 70, useNativeDriver: true }), Animated.timing(pulse, { toValue: 1, duration: reduceMotion ? 0 : 120, useNativeDriver: true })]).start(); }, [isFavorite, pulse, reduceMotion]);
  return <View style={[styles.wrap, width ? { width } : null]}><AnimatedPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onPress={onPress} style={[styles.card, animatedStyle]}><StampImage source={source} accessibilityLabel={title} style={styles.image} /><View style={styles.copy}><Text style={styles.date}>{date}</Text><Text style={styles.title} numberOfLines={2}>{title}</Text></View></AnimatedPressable>{onToggleFavorite ? <IconButton label={isFavorite ? `${favoriteLabel} on` : favoriteLabel} onPress={onToggleFavorite} style={styles.favorite}><Animated.View style={{ opacity: pulse }}><AppIcon name="heart" size={20} color={isFavorite ? theme.colors.danger : theme.colors.ink} fill={isFavorite ? theme.colors.danger : 'none'} /></Animated.View></IconButton> : null}</View>;
}

const styles = StyleSheet.create({ wrap: { position: 'relative' }, card: { padding: theme.spacing.sm, borderRadius: theme.radii.card, backgroundColor: theme.colors.bgSurface, gap: theme.spacing.sm, ...theme.shadows.low }, image: { width: '100%', aspectRatio: 1.04, minHeight: 0, alignSelf: 'center' }, copy: { gap: theme.spacing.xs }, date: { color: theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 }, title: { color: theme.colors.ink, fontSize: 16, lineHeight: 24 }, favorite: { position: 'absolute', top: 8, right: 8, backgroundColor: theme.colors.bgSurface } });
