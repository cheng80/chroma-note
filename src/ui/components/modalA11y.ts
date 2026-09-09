import { RefObject, useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, View, findNodeHandle } from 'react-native';

type ModalA11yOptions = {
  visible: boolean;
  initialFocusRef?: RefObject<unknown | null>;
  restoreFocusRef?: RefObject<unknown | null>;
};

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

  useEffect(() => {
    if (!visible) return undefined;
    const previous = restoreFocusRef?.current;
    const timer = setTimeout(() => {
      if (initialFocusRef?.current != null) focusTarget(initialFocusRef.current);
      else if (Platform.OS !== 'web') focusTarget(dialogRef.current);
    }, 0);
    return () => {
      clearTimeout(timer);
      if (previous != null) setTimeout(() => focusTarget(previous), 0);
    };
  }, [visible, initialFocusRef, restoreFocusRef]);

  return dialogRef;
}
