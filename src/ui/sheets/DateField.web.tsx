import React, { useId } from 'react';
import { SemanticText } from '../components/SemanticText';
import { Button } from '../primitives';
import { theme } from '../theme';
import { calendarDateToLocalDate } from './date-place';
import type { DateFieldProps } from './DateField';

export function DateField({ label, locale, value, onChange, onClear }: DateFieldProps) {
  const id = useId();
  return <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
    <label htmlFor={id} style={{ color: theme.colors.ink, fontSize: 14, lineHeight: '21px', fontWeight: 600 }}><SemanticText style={{ color: theme.colors.ink, fontSize: 14, lineHeight: 21, fontWeight: '600' }}>{label}</SemanticText></label>
    <input id={id} type="date" lang={locale} value={value ?? ''} onChange={(event) => {
      const next = event.currentTarget.value;
      if (!next && onClear) onClear();
      else if (calendarDateToLocalDate(next)) onChange(next);
    }} style={{ minHeight: theme.buttonHeight, boxSizing: 'border-box', width: '100%', padding: '14px 16px', border: `1px solid ${theme.colors.borderControl}`, borderRadius: theme.radii.field, background: theme.colors.bgSurface, color: theme.colors.ink, fontFamily: theme.typography.fontFamily, fontSize: 16, colorScheme: 'light' }} />
    {value && onClear ? <Button label={locale === 'ko' ? '날짜 해제' : 'Clear date'} accessibilityLabel={locale === 'ko' ? `${label}, 날짜 해제` : `${label}, Clear date`} onPress={onClear} tone="subtle" /> : null}
  </div>;
}
