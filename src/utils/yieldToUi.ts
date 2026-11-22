import { AppState } from 'react-native';

/**
 * Yield a macrotask so the UI can paint. React Native pauses JS timers while the app
 * is in the background, so there the yield resolves immediately, and a timer pending
 * when the app backgrounds is abandoned rather than waited on.
 */
export function yieldToUi(): Promise<void> {
  if (AppState.currentState !== 'active') return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.remove();
      resolve();
    };
    const timer = setTimeout(settle, 0);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') settle();
    });
  });
}
