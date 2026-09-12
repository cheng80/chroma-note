import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextProps, TextStyle, useWindowDimensions, View } from 'react-native';
import { canWrapSemantically, joinSemanticParagraphs, prepareSemanticWrap, resolveSemanticWrap } from './semantic-wrap';

export type SemanticTextProps = Omit<TextProps, 'children'> & { children: string; onSettled?: (ready: boolean) => void };

/** Select display-only breaks per paragraph, preserving source text and explicit newlines. */
export function SemanticText(props: SemanticTextProps) {
  const { fontScale } = useWindowDimensions();
  const style = StyleSheet.flatten(props.style) ?? {};
  const unsupported = props.numberOfLines === 1 || props.adjustsFontSizeToFit || props.selectable
    || style.textAlign === 'justify'
    || Object.keys(style).some(key => /^(padding|border.*Width)/u.test(key));
  const key = JSON.stringify([props.children, style, fontScale, props.allowFontScaling, props.maxFontSizeMultiplier,
    props.dynamicTypeRamp, props.lineBreakStrategyIOS, props.textBreakStrategy, props.android_hyphenationFrequency, props.numberOfLines]);
  if (Platform.OS === 'web' || unsupported || !props.children.split(/(\r?\n)/u).some(canWrapSemantically)) {
    return <NativeText key={key} {...props} />;
  }
  return <MeasuredText key={key} {...props} />;
}

function useSettled(ready: boolean, onSettled: SemanticTextProps['onSettled']) {
  const callback = useRef(onSettled);
  useLayoutEffect(() => { callback.current = onSettled; }, [onSettled]);
  useEffect(() => { callback.current?.(ready); }, [ready]);
}

function NativeText({ onSettled, ...props }: SemanticTextProps) {
  useSettled(true, onSettled);
  return <Text {...props} />;
}

function MeasuredText({ children, onLayout, onSettled, ...props }: SemanticTextProps) {
  const [width, setWidth] = useState(0);
  const [selection, setSelection] = useState({ width: 0, paragraphs: new Map<number, string>() });
  const parts = useMemo(() => children.split(/(\r?\n)/u), [children]);
  const eligible = useMemo(() => parts.flatMap((text, index) => index % 2 === 0 && canWrapSemantically(text) ? [index] : []), [parts]);
  useSettled(width > 0 && selection.width === width && eligible.every(index => selection.paragraphs.has(index)), onSettled);
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
      onLayout={event => {
        const next = event.nativeEvent.layout.width;
        if (next !== width) {
          setWidth(next);
          setSelection(previous => previous.width === 0 ? previous : { width: 0, paragraphs: new Map() });
        }
        onLayout?.(event);
      }}>
      {selection.width === width ? joinSemanticParagraphs(parts, selection.paragraphs) : children}
    </Text>
    {width > 0 ? eligible.map(index => <TextMeasurement key={`${width}:${index}`} text={parts[index]} width={width} typography={typography} metrics={metrics}
      numberOfLines={props.numberOfLines} onResult={text => setSelection(previous => {
        const paragraphs = previous.width === width ? previous.paragraphs : new Map<number, string>();
        return paragraphs.get(index) === text ? previous : { width, paragraphs: new Map(paragraphs).set(index, text) };
      })} />) : null}
  </>;
}

function TextMeasurement({ text, width, typography, metrics, numberOfLines, onResult }: {
  text: string; width: number; typography: TextStyle; metrics: TextProps; numberOfLines?: number; onResult: (value: string) => void;
}) {
  const [lines, setLines] = useState<string[] | null>(null);
  const input = useMemo(() => lines === null ? null : prepareSemanticWrap(text, lines), [text, lines]);
  useEffect(() => {
    if (lines !== null && !input) onResult(text);
  }, [text, lines, input, onResult]);
  return <View style={styles.probes} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Text {...metrics} accessible={false} style={[typography, { width }]} onTextLayout={event => {
      const next = event.nativeEvent.lines.map(line => line.text);
      setLines(previous => previous?.length === next.length && previous.every((line, index) => line === next[index]) ? previous : next);
    }}>{text}</Text>
    {input && lines ? <Text {...metrics} accessible={false} style={[typography, styles.sample]} onTextLayout={event => {
      const measured = event.nativeEvent.lines;
      if (measured.length !== input.samples.length || measured.some((line, index) => line.text.replace(/\r?\n$/u, '') !== input.samples[index])) {
        onResult(text);
        return;
      }
      const widths = new Map(input.samples.map((sample, index) => [sample, measured[index].width]));
      onResult(resolveSemanticWrap(text, lines, width, widths, numberOfLines));
    }}>{input.samples.join('\n')}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  probes: { position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' },
  sample: { width: 100000 },
});
