import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { writeDraftState } from '../../services/draft-store';
import { sameSession } from '../app-state';
import type { DemoSession, DemoState } from '../contract';

/** The only writer of application state: persist first, publish second. */
export interface ControllerStore {
  getState(): DemoState;
  apply(next: DemoState, persist?: boolean): Promise<void>;
  enqueue(work: () => Promise<void>): Promise<void>;
  isCurrent(session: DemoSession): boolean;
  isMounted(): boolean;
  notice(ko: string, en: string): void;
}

export function useControllerStore(initial: () => DemoState) {
  const [state, setState] = useState(initial);
  const current = useRef(state);
  const mounted = useRef(true);
  const pending = useRef(Promise.resolve());
  const [store] = useState<ControllerStore>(() => {
    const notice = (ko: string, en: string) => {
      if (mounted.current) Alert.alert('Chroma Note', current.current.locale === 'ko' ? ko : en);
    };
    return {
      getState: () => current.current,
      isMounted: () => mounted.current,
      isCurrent: session => mounted.current && sameSession(current.current, session.owner_id, session.generation),
      notice,
      async apply(next, persist = true) {
        if (!mounted.current) return;
        const before = current.current;
        if (persist && next.session && (next.drafts !== before.drafts || next.save_attempt !== before.save_attempt)) {
          await writeDraftState(next.session.owner_id, { drafts: next.drafts, save_attempt: next.save_attempt });
        }
        if (!mounted.current) return;
        current.current = next;
        setState(next);
      },
      enqueue(work) {
        pending.current = pending.current.then(work).catch(() => notice('초안을 기기에 보관하지 못했어요. 입력 내용은 유지됩니다. 다시 시도해 주세요.', 'Could not keep the draft on this device. Your input is unchanged. Try again.'));
        return pending.current;
      },
    };
  });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return { state, store };
}
