import React, { useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import type { DisplayLocale, SheetChange, SheetState } from '../contract';
import { Button, Field, Notice, Sheet } from '../primitives';
import { recordCopy } from '../record-copy';
import { theme } from '../theme';
import { DateField } from './DateField';
import { mergeDatePlaceWorking } from './date-place';
import { SemanticText } from '../components/SemanticText';

type DatePlaceSheetProps = {
  locale: DisplayLocale;
  sheet: Extract<NonNullable<SheetState>, { kind: 'datePlace' }>;
  onChangeSheet: (change: SheetChange) => void;
  onApply: () => void;
  onCancel: () => void;
  onClose: () => void;
};

export function DatePlaceSheet({ locale, sheet, onChangeSheet, onApply, onCancel, onClose, restoreFocusRef }: DatePlaceSheetProps & { restoreFocusRef?: React.RefObject<unknown | null> }) {
  const copy = recordCopy[locale];
  const working = useRef(sheet.working);
  const [dateExpanded, setDateExpanded] = useState(false);
  const updateWorking = (change: Partial<typeof sheet.working>) => {
    working.current = mergeDatePlaceWorking(working.current, change);
    onChangeSheet({ kind: 'datePlace', working: working.current });
  };
  const updateDate = (diary_date: string) => {
    updateWorking({ diary_date, date_source: 'user' });
  };

  const footer = <><Button label={copy.apply} onPress={onApply} /><Button label={copy.cancel} onPress={onCancel} tone="secondary" /></>;
  const error = sheet.error ? <Notice message={copy.invalid} tone="error" /> : null;

  return (
    <Sheet title={copy.datePlaceTitle} closeLabel={copy.close} restoreFocusRef={restoreFocusRef} onRequestClose={onClose} footer={footer}>
      <DateField label={copy.dateField} locale={locale} value={sheet.working.diary_date} onChange={updateDate} expanded={dateExpanded} onExpandedChange={setDateExpanded} />
      <Field label={copy.placeField} value={sheet.working.place_name ?? ''} onFocus={() => setDateExpanded(false)} onChangeText={(place_name) => updateWorking({ place_name: place_name || null })} />
      {error}
      <SemanticText style={styles.hint}>{copy.placeHint}</SemanticText>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: -theme.spacing.md, color: theme.colors.inkSecondary, fontFamily: theme.typography.fontFamily, fontSize: 12, lineHeight: 18 },
});
