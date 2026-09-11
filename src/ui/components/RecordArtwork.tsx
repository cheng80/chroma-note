import React, { RefObject } from 'react';
import Reanimated from 'react-native-reanimated';
import { ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DisplayLocale, RecordFields } from '../contract';
import { displayDate } from '../record-copy';
import { theme } from '../theme';
import { usePressScale } from './motion';
import { StampImage } from './StampImage';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

type Props = {
  fields: RecordFields;
  source: ImageSourcePropType;
  locale: DisplayLocale;
  aspectRatio?: number;
  exportMode?: boolean;
  onImageLoad?: () => void;
  onImageError?: () => void;
  onImagePress?: () => void;
  imageButtonRef?: RefObject<View | null>;
};

/** The same complete record is used on screen and in the exported image. */
export function RecordArtwork({ fields, source, locale, aspectRatio = 1, exportMode = false, onImageLoad, onImageError, onImagePress, imageButtonRef }: Props) {
  const { animatedStyle, setPressed } = usePressScale();
  const aiNote = fields.ai_field_note_edited ?? fields.ai_field_note;
  const tags = [...fields.semantic_tags, ...fields.mood_tags];
  const image = <StampImage source={source} resizeMode="contain" style={[styles.imageFrame, { aspectRatio }]} accessibilityLabel={locale === 'ko' ? '기록의 컬러 스케치' : 'Record color sketch'} onLoad={onImageLoad} onError={onImageError} />;
  return <View collapsable={false} style={[styles.paper, !exportMode && styles.card]}>
    {onImagePress && !exportMode ? <AnimatedPressable ref={imageButtonRef} accessibilityRole="button" accessibilityLabel={locale === 'ko' ? '컬러 스케치 이미지 확대' : 'Enlarge color sketch'} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onPress={onImagePress} style={animatedStyle}>{image}</AnimatedPressable> : image}
    <View style={styles.writing}>
      {fields.place_name ? <Text allowFontScaling={!exportMode} style={styles.place}>{fields.place_name}</Text> : null}
      <Text allowFontScaling={!exportMode} style={styles.date}>{displayDate(fields.diary_date)}</Text>
      {fields.user_note ? <Text allowFontScaling={!exportMode} style={styles.note}>{fields.user_note}</Text> : null}
      {aiNote ? <View style={styles.ai}><Text allowFontScaling={!exportMode} style={styles.label}>{locale === 'ko' ? 'AI가 쓴 글' : 'AI writing'}</Text><Text allowFontScaling={!exportMode} style={styles.note}>{aiNote}</Text></View> : null}
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
  ai: { gap: 6 },
  label: { color: theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 },
  tag: { maxWidth: '100%', flexShrink: 1, color: theme.colors.inkSecondary, fontSize: 14, lineHeight: 22 },
});
