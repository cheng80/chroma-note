import type { DatePlaceSheetValue } from '../contract';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function mergeDatePlaceWorking(
  current: DatePlaceSheetValue,
  change: Partial<DatePlaceSheetValue>,
): DatePlaceSheetValue {
  return { ...current, ...change };
}

/**
 * Converts the persisted calendar-only value to a local Date without parsing it
 * as UTC. Noon avoids DST transitions when the native picker opens.
 */
export function calendarDateToLocalDate(value: string): Date | null {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** Converts a native picker value to the calendar-only format using local time. */
export function localDateToCalendarDate(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
