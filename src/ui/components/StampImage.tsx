import React from 'react';
import { Image, ImageProps, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '../theme';

export type StampImageProps = Omit<ImageProps, 'source'> & {
  source: ImageSourcePropType;
};

export function StampImage({ source, accessibilityLabel, style, ...props }: StampImageProps) {
  return (
    <View style={[styles.image, style as StyleProp<ViewStyle>]}>
      <Image
        {...props}
        source={source}
        accessible={Boolean(accessibilityLabel)}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        resizeMode={props.resizeMode ?? 'contain'}
        style={[StyleSheet.absoluteFill, styles.content]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    backgroundColor: theme.colors.bgSunken,
    borderWidth: 1,
    borderColor: '#0000001A',
    borderRadius: theme.radii.image,
    overflow: 'hidden',
  },
  content: { width: '100%', height: '100%' },
});
