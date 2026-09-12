import React, { RefObject } from 'react';
import Reanimated from 'react-native-reanimated';
import { ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DisplayLocale, RecordFields } from '../contract';
import { displayDate } from '../record-copy';
import { recordWriting } from '../record-writing';
import { theme } from '../theme';
import { usePressScale } from './motion';
import { StampImage } from './StampImage';
import { LineArtDisclaimer } from './LineArtDisclaimer';
import { SemanticText } from './SemanticText';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

type Props = {
  fields: RecordFields;
  source: ImageSourcePropType;
  locale: DisplayLocale;
  aspectRatio?: number;
  exportMode?: boolean;
  imageMissing?: boolean;
  onImageLoad?: () => void;
  onImageError?: () => void;
  onImagePress?: () => void;
  imageButtonRef?: RefObject<View | null>;
  onTextSettled?: (field: string, ready: boolean) => void;
};

/** Export keeps the complete record and excludes the screen-only conversion notice. */
export function RecordArtwork({ fields, source, locale, aspectRatio = 1, exportMode = false, imageMissing = false, onImageLoad, onImageError, onImagePress, imageButtonRef, onTextSettled }: Props) {
  const { animatedStyle, setPressed } = usePressScale();
  const writing = recordWriting(fields);
  const tags = [...fields.semantic_tags, ...fields.mood_tags];
  const image = <StampImage source={source} resizeMode="contain" style={[styles.imageFrame, { aspectRatio }]} accessibilityLabel={locale === 'ko' ? '기록의 컬러 스케치' : 'Record color sketch'} onLoad={onImageLoad} onError={onImageError} />;
  return <View collapsable={false} style={[styles.paper, !exportMode && styles.card]}>
    {imageMissing ? null : <View>
      {onImagePress && !exportMode ? <AnimatedPressable ref={imageButtonRef} accessibilityRole="button" accessibilityLabel={locale === 'ko' ? '컬러 스케치 이미지 확대' : 'Enlarge color sketch'} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onPress={onImagePress} style={animatedStyle}>{image}</AnimatedPressable> : image}
      {!exportMode ? <LineArtDisclaimer locale={locale} /> : null}
    </View>}
    <View style={styles.writing}>
      {fields.place_name ? <SemanticText allowFontScaling={!exportMode} style={styles.place} onSettled={ready => onTextSettled?.('place', ready)}>{fields.place_name}</SemanticText> : null}
      <Text allowFontScaling={!exportMode} style={styles.date}>{displayDate(fields.diary_date)}</Text>
      {writing ? <SemanticText allowFontScaling={!exportMode} style={styles.note} onSettled={ready => onTextSettled?.('note', ready)}>{writing}</SemanticText> : null}
      {tags.length ? <View style={styles.tags}>{tags.map((tag, index) => <Text allowFontScaling={!exportMode} key={`${index}-${tag}`} style={styles.tag}>#{tag}</Text>)}</View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  paper: { backgroundColor: theme.colors.bgPage, padding: 20, gap: 24 },
  card: { borderRadius: theme.radii.card, ...theme.shadows.low, marginBottom: 16 },
  imageFrame: { width: '100%', borderWidth: 0, borderRadius: 0, backgroundColor: theme.colors.bgPage },
  writing: { gap: 14 },
  place: { color: theme.colors.ink, fontSize: 21, lineHeight: 30, fontWeight: '600' },
  date: { color: theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  note: { color: theme.colors.ink, fontSize: 16, lineHeight: 26 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 },
  tag: { maxWidth: '100%', flexShrink: 1, color: theme.colors.inkSecondary, fontSize: 14, lineHeight: 22 },
});
