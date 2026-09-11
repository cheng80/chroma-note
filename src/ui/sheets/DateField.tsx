import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '../primitives';
import { displayDate } from '../record-copy';
import { theme } from '../theme';
import { calendarDateToLocalDate, localDateToCalendarDate } from './date-place';

export type DateFieldProps = {
  label: string;
  locale: 'ko' | 'en';
  value: string | null;
  onChange: (value: string) => void;
  onClear?: () => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

export function DateField({ label, locale, value, onChange, onClear, expanded, onExpandedChange }: DateFieldProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded ?? internalExpanded;
  const setExpanded = (next: boolean) => {
    if (expanded === undefined) setInternalExpanded(next);
    onExpandedChange?.(next);
  };

  const dateLabel = value ? displayDate(value) : locale === 'ko' ? '날짜 선택' : 'Choose date';
  const selectedDate = calendarDateToLocalDate(value ?? '') ?? today();
  const openPicker = () => {
    Keyboard.dismiss();
    if (!isExpanded && value === null && Platform.OS === 'ios') onChange(localDateToCalendarDate(selectedDate));
    setExpanded(!isExpanded);
  };
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Button
        label={dateLabel}
        accessibilityLabel={`${label}, ${dateLabel}`}
        accessibilityState={{ expanded: isExpanded }}
        onPress={openPicker}
        tone="secondary"
        accessibilityHint={locale === 'ko' ? '달력에서 날짜를 선택합니다.' : 'Choose a date from the calendar.'}
      />
      {isExpanded ? (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
          locale={Platform.OS === 'ios' ? locale === 'ko' ? 'ko-KR' : 'en-US' : undefined}
          themeVariant="light"
          accentColor={theme.colors.accent}
          onValueChange={(_event, date) => {
            onChange(localDateToCalendarDate(date));
            if (Platform.OS === 'android') setExpanded(false);
          }}
          onDismiss={() => setExpanded(false)}
        />
      ) : null}
      {value && onClear ? <Button label={locale === 'ko' ? '날짜 해제' : 'Clear date'} accessibilityLabel={locale === 'ko' ? `${label}, 날짜 해제` : `${label}, Clear date`} onPress={() => { onClear(); setExpanded(false); }} tone="subtle" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.sm },
  label: {
    color: theme.colors.ink,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.secondary.fontSize,
    lineHeight: theme.typography.secondary.lineHeight,
    fontWeight: '600',
  },
});
