import { RefObject, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, View, findNodeHandle } from 'react-native';

type ModalA11yOptions = {
  visible: boolean;
  initialFocusRef?: RefObject<unknown | null>;
  restoreFocusRef?: RefObject<unknown | null>;
};

let restoreFocusTimer: ReturnType<typeof setTimeout> | null = null;
let activeModalCount = 0;

function cancelRestoreFocus() {
  if (restoreFocusTimer !== null) clearTimeout(restoreFocusTimer);
  restoreFocusTimer = null;
}

function focusTarget(target: unknown) {
  if (Platform.OS === 'web') {
    const focus = (target as { focus?: unknown } | null)?.focus;
    if (typeof focus === 'function') focus.call(target);
    return;
  }
  const handle = target == null ? null : findNodeHandle(target as never);
  if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
}

export function useModalA11y({ visible, initialFocusRef, restoreFocusRef }: ModalA11yOptions) {
  const dialogRef = useRef<View>(null);
  const visibleRef = useRef(visible);
  const initialFocusRefRef = useRef(initialFocusRef);
  const restoreFocusRefRef = useRef(restoreFocusRef);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    visibleRef.current = visible;
    if (visible) {
      initialFocusRefRef.current = initialFocusRef;
      restoreFocusRefRef.current = restoreFocusRef;
    }
  }, [visible, initialFocusRef, restoreFocusRef]);
  const onShow = useCallback(() => {
    if (!visibleRef.current) return;
    cancelRestoreFocus();
    if (focusTimer.current !== null) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      focusTimer.current = null;
      if (!visibleRef.current) return;
      if (initialFocusRefRef.current?.current != null) focusTarget(initialFocusRefRef.current.current);
      else if (Platform.OS !== 'web') focusTarget(dialogRef.current);
    }, 0);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    activeModalCount += 1;
    cancelRestoreFocus();
    return () => {
      if (focusTimer.current !== null) clearTimeout(focusTimer.current);
      const previous = restoreFocusRefRef.current?.current;
      activeModalCount -= 1;
      if (activeModalCount === 0 && previous != null) {
        cancelRestoreFocus();
        restoreFocusTimer = setTimeout(() => {
          restoreFocusTimer = null;
          focusTarget(previous);
        }, 0);
      }
    };
  }, [visible]);

  return { dialogRef, onShow };
}
