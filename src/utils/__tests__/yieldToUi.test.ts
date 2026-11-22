import { AppState } from 'react-native';

import { yieldToUi } from '../yieldToUi';

const originalState = AppState.currentState;
let appState = 'active';
let changeListener: ((state: string) => void) | null = null;
const remove = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  appState = 'active';
  changeListener = null;
  remove.mockClear();
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => appState });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, cb: (s: string) => void) => {
    changeListener = cb;
    return { remove };
  }) as never);
});

afterEach(() => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: originalState });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('yieldToUi', () => {
  it.each(['background', 'inactive'])('resolves without a timer when the app is %s', async (state) => {
    appState = state;
    let resolved = false;
    void yieldToUi().then(() => {
      resolved = true;
    });
    await flushMicrotasks();
    expect(resolved).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    expect(AppState.addEventListener).not.toHaveBeenCalled();
  });

  it('waits for the 0 ms timer while active', async () => {
    let resolved = false;
    void yieldToUi().then(() => {
      resolved = true;
    });
    await flushMicrotasks();
    expect(resolved).toBe(false);
    jest.advanceTimersByTime(0);
    await flushMicrotasks();
    expect(resolved).toBe(true);
  });

  it('resolves without the timer when the app backgrounds first', async () => {
    let resolved = false;
    void yieldToUi().then(() => {
      resolved = true;
    });
    await flushMicrotasks();
    expect(resolved).toBe(false);
    changeListener!('background');
    await flushMicrotasks();
    expect(resolved).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores a change to active and keeps waiting for the timer', async () => {
    let resolved = false;
    void yieldToUi().then(() => {
      resolved = true;
    });
    changeListener!('active');
    await flushMicrotasks();
    expect(resolved).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    jest.advanceTimersByTime(0);
    await flushMicrotasks();
    expect(resolved).toBe(true);
  });

  it('settles once and releases the timer and the listener', async () => {
    const p = yieldToUi();
    jest.advanceTimersByTime(0);
    await p;
    expect(remove).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    // A late event after settling is a no-op.
    changeListener!('background');
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
