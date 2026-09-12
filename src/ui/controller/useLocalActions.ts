import { useCallback, useEffect } from 'react';
import { getLocales } from 'expo-localization';
import { secureSessionStorage } from '../../services/secure-session';
import { preserveAdoptedCaption } from '../app-state';
import { demoReducer, displayLocale, type DemoAction } from '../demo-state';
import type { LocalePreference } from '../contract';
import type { ControllerStore } from './controller-store';

const localePreferenceKey = 'chroma-locale-preference';
export function deviceLocale() { return getLocales()[0]?.languageTag ?? Intl.DateTimeFormat().resolvedOptions().locale; }

/** Local form/navigation changes never execute a server operation. */
export function useLocalActions(store: ControllerStore, cancelCaption: () => void, refresh: () => Promise<void>) {
  const { getState, apply, enqueue, notice } = store;
  useEffect(() => {
    void secureSessionStorage.getItem(localePreferenceKey).then(value => {
      if (!['system', 'ko', 'en'].includes(value ?? '')) return;
      void enqueue(async () => {
        const s = getState();
        const locale_preference = value as LocalePreference;
        const locale = displayLocale(locale_preference, deviceLocale());
        await apply({ ...s, locale_preference, locale, session: s.session ? { ...s.session, locale } : null }, false);
      });
    }).catch(() => undefined);
  }, [apply, enqueue, getState]);

  return useCallback(async (action: DemoAction) => {
    const s = getState();
    if (action.type === 'delete-account-result') {
      notice('계정 삭제는 서버의 최근 재인증 확인 후 진행됩니다. 연결 작업 중입니다.', 'Account deletion requires recent authentication. This connection is being prepared.');
      await apply({ ...s, dialog: null }, false);
      return;
    }
    if (['scenario', 'save-result', 'tick-processing', 'caption-result', 'regenerate', 'adopt-request', 'adopt-confirm', 'adopt-cancel'].includes(action.type)) return;
    if (action.type === 'edit-record' && s.drafts.edit && s.drafts.edit.record_id !== s.selected_record_id) {
      notice('저장하지 않은 편집 초안이 있어요. 먼저 해당 기록의 편집을 마쳐 주세요.', 'Finish the existing edit draft first.');
      return;
    }
    if (s.save_attempt && !['saved', 'demo_saved'].includes(s.save_attempt.state) && ['sheet-apply', 'edit-record'].includes(action.type)) {
      notice('이전 저장 결과를 먼저 확인해 주세요. 같은 저장 요청으로 재시도할 수 있어요.', 'Resolve the pending save before making more changes. Retry the same save request.');
      return;
    }
    const reducedAction = action.type === 'locale' ? { ...action, systemLocale: deviceLocale() } : action;
    let next = demoReducer(s, reducedAction);
    if (action.type === 'sheet-apply') next = preserveAdoptedCaption(s, next);
    if (action.type === 'edit-record' && s.drafts.edit?.record_id === s.selected_record_id) next = { ...next, drafts: s.drafts };
    if (action.type === 'sheet-cancel' || action.type === 'sheet-discard-confirm' || action.type === 'sheet-apply') cancelCaption();
    await apply(next);
    if (action.type === 'locale') void secureSessionStorage.setItem(localePreferenceKey, action.value).catch(() => notice('언어 설정을 저장하지 못했어요.', 'Could not save the language setting.'));
    if (action.type === 'back-book' || action.type === 'back-settings' || (action.type === 'sheet-apply' && s.sheet?.kind === 'filter')) void refresh();
  }, [apply, cancelCaption, getState, notice, refresh]);
}
