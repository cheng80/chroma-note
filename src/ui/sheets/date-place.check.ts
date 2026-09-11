import { calendarDateToLocalDate, localDateToCalendarDate, mergeDatePlaceWorking } from './date-place.ts';
import { DEMO_CODE, demoReducer, initialDemoState } from '../demo-state.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const leapDay = calendarDateToLocalDate('2024-02-29');
assert(leapDay !== null, 'a leap day must be accepted');
assert(localDateToCalendarDate(leapDay) === '2024-02-29', 'a calendar date must round-trip without UTC conversion');
assert(calendarDateToLocalDate('2026-02-30') === null, 'an invalid calendar date must be rejected');
assert(calendarDateToLocalDate('2026-2-03') === null, 'calendar dates must remain YYYY-MM-DD');
assert(localDateToCalendarDate(new Date(2026, 0, 1, 12)) === '2026-01-01', 'local formatting must preserve the selected day');

function summaryState() {
  let state = initialDemoState();
  state = demoReducer(state, { type: 'email', value: 'demo@example.com' });
  state = demoReducer(state, { type: 'submit-email' });
  state = demoReducer(state, { type: 'code', value: DEMO_CODE });
  state = demoReducer(state, { type: 'verify' });
  state = demoReducer(state, { type: 'start-record' });
  state = demoReducer(state, { type: 'use-photo' });
  state = demoReducer(state, { type: 'continue-photo' });
  while (state.active_job) {
    state = demoReducer(state, { type: 'tick-processing', jobId: state.active_job.job_id, inputRevision: state.active_job.input_revision });
  }
  state = demoReducer(state, { type: 'confirm', value: true });
  return demoReducer(state, { type: 'continue-compare' });
}

let recordState = summaryState();
const draft = recordState.drafts.new!;
recordState = { ...recordState, drafts: { ...recordState.drafts, new: { ...draft, fields: { ...draft.fields, diary_date: '2026-09-10', date_source: 'exif', place_name: '서촌 카페' } } } };
recordState = demoReducer(recordState, { type: 'open-summary-sheet', kind: 'datePlace' });
assert(recordState.sheet?.kind === 'datePlace', 'the date and place sheet must open');
let working = mergeDatePlaceWorking(recordState.sheet.working, { place_name: '남산 산책로' });
working = mergeDatePlaceWorking(working, { diary_date: '2026-09-11', date_source: 'user' });
assert(working.place_name === '남산 산책로', 'a date event must not erase a pending place edit');
recordState = demoReducer(recordState, { type: 'sheet-change', change: { kind: 'datePlace', working } });
recordState = demoReducer(recordState, { type: 'sheet-close' });
assert(recordState.dialog?.kind === 'discard-draft', 'back or close must confirm before discarding edits');
recordState = demoReducer(recordState, { type: 'sheet-discard-confirm' });
assert(recordState.drafts.new?.fields.diary_date === '2026-09-10' && recordState.drafts.new.fields.place_name === '서촌 카페', 'discarding must preserve the applied date and place');
recordState = demoReducer(recordState, { type: 'open-summary-sheet', kind: 'datePlace' });
assert(recordState.sheet?.kind === 'datePlace' && recordState.sheet.working.place_name === '서촌 카페', 'reopening after discard must restore the applied values');
recordState = demoReducer(recordState, { type: 'sheet-change', change: { kind: 'datePlace', working: mergeDatePlaceWorking(recordState.sheet.working, { place_name: '한강 공원' }) } });
recordState = demoReducer(recordState, { type: 'sheet-cancel' });
assert(recordState.drafts.new?.fields.place_name === '서촌 카페', 'Cancel must not leak a place edit');
recordState = demoReducer(recordState, { type: 'open-summary-sheet', kind: 'datePlace' });
assert(recordState.sheet?.kind === 'datePlace', 'the date and place sheet must reopen after Cancel');
recordState = demoReducer(recordState, { type: 'sheet-change', change: { kind: 'datePlace', working: mergeDatePlaceWorking(recordState.sheet.working, { diary_date: '2026-09-12', date_source: 'user', place_name: '연남동 책방' }) } });
recordState = demoReducer(recordState, { type: 'sheet-apply' });
assert(recordState.drafts.new?.fields.diary_date === '2026-09-12' && recordState.drafts.new.fields.place_name === '연남동 책방', 'Apply must commit both date and place');
recordState = demoReducer(recordState, { type: 'open-summary-sheet', kind: 'datePlace' });
assert(recordState.sheet?.kind === 'datePlace' && recordState.sheet.working.diary_date === '2026-09-12' && recordState.sheet.working.place_name === '연남동 책방', 'reopening after Apply must show the applied values');

let state = demoReducer(initialDemoState(), { type: 'open-filter' });
const range = { start_date: '2026-09-01', end_date: '2026-09-16', semantic_tag: null, favorite_only: false };
state = demoReducer(state, { type: 'sheet-change', change: { kind: 'filter', working: range } });
assert(state.book_filter.start_date === null, 'calendar changes must stay local until Apply');
state = demoReducer(state, { type: 'sheet-cancel' });
assert(state.book_filter.start_date === null && state.book_filter.end_date === null, 'Cancel must preserve the previous filter');
state = demoReducer(state, { type: 'open-filter' });
state = demoReducer(state, { type: 'sheet-change', change: { kind: 'filter', working: range } });
state = demoReducer(state, { type: 'sheet-apply' });
assert(state.book_filter.start_date === '2026-09-01' && state.book_filter.end_date === '2026-09-16', 'Apply must keep both calendar dates');
state = demoReducer(state, { type: 'open-filter' });
state = demoReducer(state, { type: 'sheet-change', change: { kind: 'filter', working: { ...range, start_date: null } } });
state = demoReducer(state, { type: 'sheet-apply' });
assert(state.book_filter.start_date === null && state.book_filter.end_date === '2026-09-16', 'clearing one date must keep the other bound');
state = demoReducer(state, { type: 'open-filter' });
state = demoReducer(state, { type: 'sheet-change', change: { kind: 'filter', working: { ...range, start_date: '2026-09-20' } } });
state = demoReducer(state, { type: 'sheet-apply' });
assert(state.sheet?.kind === 'filter' && state.sheet.error && state.book_filter.start_date === null, 'an inverted range must not replace the applied filter');
console.log('date-place.check passed: local dates, date/place apply/cancel/discard/reopen, filter ranges');
