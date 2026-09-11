import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextProps, TextStyle, useWindowDimensions, View } from 'react-native';
import { canWrapSemantically, prepareSemanticWrap, resolveSemanticWrap } from './semantic-wrap';

export type SemanticTextProps = Omit<TextProps, 'children'> & { children: string };

/** Plain, short UI copy only. User content and explicit newlines use native Text. */
export function SemanticText(props: SemanticTextProps) {
  const { fontScale } = useWindowDimensions();
  const style = StyleSheet.flatten(props.style) ?? {};
  const unsupported = props.numberOfLines === 1 || props.adjustsFontSizeToFit || props.selectable
    || style.textAlign === 'justify'
    || Object.keys(style).some(key => /^(padding|border.*Width)/u.test(key));
  if (Platform.OS === 'web' || unsupported || !canWrapSemantically(props.children)) return <Text {...props} />;
  const key = JSON.stringify([props.children, style, fontScale, props.allowFontScaling, props.maxFontSizeMultiplier,
    props.dynamicTypeRamp, props.lineBreakStrategyIOS, props.textBreakStrategy, props.android_hyphenationFrequency, props.numberOfLines]);
  return <MeasuredText key={key} {...props} />;
}

function MeasuredText({ children, onLayout, ...props }: SemanticTextProps) {
  const [width, setWidth] = useState(0);
  const [selection, setSelection] = useState({ width: 0, text: children });
  const flat = StyleSheet.flatten(props.style) ?? {};
  const typography: TextStyle = {
    fontFamily: flat.fontFamily, fontSize: flat.fontSize, fontWeight: flat.fontWeight,
    fontStyle: flat.fontStyle, fontVariant: flat.fontVariant, letterSpacing: flat.letterSpacing,
    lineHeight: flat.lineHeight, textTransform: flat.textTransform, writingDirection: flat.writingDirection,
    includeFontPadding: flat.includeFontPadding,
  };
  const metrics: TextProps = {
    allowFontScaling: props.allowFontScaling, maxFontSizeMultiplier: props.maxFontSizeMultiplier,
    dynamicTypeRamp: props.dynamicTypeRamp, lineBreakStrategyIOS: props.lineBreakStrategyIOS,
    textBreakStrategy: props.textBreakStrategy, android_hyphenationFrequency: props.android_hyphenationFrequency,
  };
  return <>
    <Text {...props} accessibilityLabel={props.accessibilityLabel ?? children}
      onLayout={event => { setWidth(event.nativeEvent.layout.width); onLayout?.(event); }}>
      {selection.width === width ? selection.text : children}
    </Text>
    {width > 0 ? <TextMeasurement key={width} text={children} width={width} typography={typography} metrics={metrics}
      numberOfLines={props.numberOfLines} onResult={text => setSelection(previous => previous.width === width && previous.text === text ? previous : { width, text })} /> : null}
  </>;
}

function TextMeasurement({ text, width, typography, metrics, numberOfLines, onResult }: {
  text: string; width: number; typography: TextStyle; metrics: TextProps; numberOfLines?: number; onResult: (value: string) => void;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const input = useMemo(() => prepareSemanticWrap(text, lines), [text, lines]);
  return <View style={styles.probes} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Text {...metrics} accessible={false} style={[typography, { width }]} onTextLayout={event => {
      const next = event.nativeEvent.lines.map(line => line.text);
      setLines(previous => previous.length === next.length && previous.every((line, index) => line === next[index]) ? previous : next);
    }}>{text}</Text>
    {input ? <Text {...metrics} accessible={false} style={[typography, styles.sample]} onTextLayout={event => {
      const measured = event.nativeEvent.lines;
      if (measured.length !== input.samples.length || measured.some((line, index) => line.text.replace(/\n$/u, '') !== input.samples[index])) return;
      const widths = new Map(input.samples.map((sample, index) => [sample, measured[index].width]));
      onResult(resolveSemanticWrap(text, lines, width, widths, numberOfLines));
    }}>{input.samples.join('\n')}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  probes: { position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' },
  sample: { width: 100000 },
});
