import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { AppIcon } from './AppIcon';
import { useLiveReduceMotion } from './motion';
import { theme } from '../theme';

const particles = ['#F2B34A', '#F58C9D', '#83A9D5', '#B388C6', '#7BAE96', '#F2B34A', '#F58C9D'];

function BurstParticle({ progress, index, visible }: { progress: SharedValue<number>; index: number; visible: boolean }) {
  const angle = (index / particles.length) * Math.PI * 2 - Math.PI / 2;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const motionStyle = useAnimatedStyle(() => ({
    opacity: visible ? Math.max(0, Math.min(progress.value * 6, (1 - progress.value) * 1.8)) : 0,
    transform: [
      { translateX: x * (10 + progress.value * 24) },
      { translateY: y * (10 + progress.value * 24) },
      { scale: 1 - progress.value * 0.55 },
    ],
  }));
  return <Animated.View style={[styles.particle, { backgroundColor: particles[index] }, motionStyle]} />;
}

export function FavoriteIcon({ selected }: { selected: boolean }) {
  const reduceMotion = useLiveReduceMotion();
  const previous = useRef(selected);
  const scale = useSharedValue(1);
  const fill = useSharedValue(selected ? 1 : 0);
  const echo = useSharedValue(1);

  useEffect(() => {
    const changed = selected !== previous.current;
    previous.current = selected;
    const cancel = () => {
      cancelAnimation(scale);
      cancelAnimation(fill);
      cancelAnimation(echo);
    };
    cancel();
    scale.value = 1;
    echo.value = 1;
    if (reduceMotion || !changed) {
      fill.value = selected ? 1 : 0;
    } else {
      fill.value = withTiming(selected ? 1 : 0, { duration: theme.motion.enterDuration, reduceMotion: ReduceMotion.Never });
      if (selected) {
        scale.value = 0.7;
        scale.value = withSequence(
          ReduceMotion.Never,
          withTiming(1.6, { duration: 180, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never }),
          withSpring(1, { stiffness: 230, damping: 12, mass: 0.7, reduceMotion: ReduceMotion.Never }),
        );
        echo.value = 0;
        echo.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never });
      }
    }
    return cancel;
  }, [echo, fill, reduceMotion, scale, selected]);

  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: reduceMotion ? 1 : scale.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: reduceMotion ? (selected ? 1 : 0) : fill.value }));
  const echoStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion || !selected ? 0 : Math.max(0, 1 - echo.value * 1.4),
    transform: [{ scale: reduceMotion ? 1 : 0.6 + echo.value * 2.2 }],
  }));
  return <View pointerEvents="none" style={styles.root}>
    <Animated.View style={[styles.ring, echoStyle]} />
    {particles.map((_, index) => <BurstParticle key={index} index={index} progress={echo} visible={selected && !reduceMotion} />)}
    <Animated.View style={heartStyle}>
      <AppIcon name="heart" color={theme.colors.ink} />
      <Animated.View style={[styles.layer, fillStyle]}><AppIcon name="heart" color={theme.colors.favorite} fill={theme.colors.favorite} /></Animated.View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  root: { width: 20, height: 20 },
  layer: { position: 'absolute', top: 0, left: 0 },
  ring: { position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: theme.colors.favorite },
  particle: { position: 'absolute', top: 8, left: 8, width: 4, height: 4, borderRadius: 2 },
});
