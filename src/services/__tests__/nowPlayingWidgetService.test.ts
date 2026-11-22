import { Platform } from 'react-native';

import { setWidgetSnapshot, clearWidget } from 'expo-now-playing-widget';
import { playerStore } from '../../store/playerStore';
import type { Child } from '../subsonicService';
import {
  syncNowPlayingWidget,
  clearNowPlayingWidget,
  initNowPlayingWidget,
  __test,
} from '../nowPlayingWidgetService';

jest.mock('expo-now-playing-widget', () => ({
  setWidgetSnapshot: jest.fn(),
  clearWidget: jest.fn(),
}));

// The service only consumes getCoverArtUrl from subsonicService.
jest.mock('../subsonicService', () => ({
  getCoverArtUrl: jest.fn((id: string, size?: number) => (id ? `art://${id}?s=${size}` : null)),
}));

const mockSet = jest.mocked(setWidgetSnapshot);
const mockClear = jest.mocked(clearWidget);

function setPlatform(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

const track = (id: string, over: Partial<Child> = {}): Child =>
  ({ id, title: `Title ${id}`, artist: `Artist ${id}`, coverArt: `cov-${id}`, ...over }) as Child;

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  __test.reset();
  playerStore.setState({ queue: [], currentTrackIndex: null, playbackState: 'idle' });
  setPlatform('android');
});

afterEach(() => {
  // Dispose the store subscription + any pending debounce timer so nothing
  // fires after the Jest environment is torn down.
  __test.reset();
});

afterAll(() => {
  setPlatform(originalOS as 'android' | 'ios');
});

describe('buildSnapshot', () => {
  it('maps the queue to widget tracks with cover-art URLs', () => {
    playerStore.setState({
      queue: [track('a'), track('b', { coverArt: undefined })],
      currentTrackIndex: 1,
      playbackState: 'playing',
    });

    const snap = __test.buildSnapshot();

    expect(snap).toEqual({
      hasSession: true,
      isPlaying: true,
      currentIndex: 1,
      tracks: [
        { id: 'a', title: 'Title a', artist: 'Artist a', artUri: 'art://cov-a?s=160' },
        { id: 'b', title: 'Title b', artist: 'Artist b', artUri: null },
      ],
    });
  });

  it('reports an empty session and clamps an out-of-range index to -1', () => {
    playerStore.setState({ queue: [], currentTrackIndex: 3, playbackState: 'idle' });

    const snap = __test.buildSnapshot();

    expect(snap.hasSession).toBe(false);
    expect(snap.isPlaying).toBe(false);
    expect(snap.currentIndex).toBe(-1);
    expect(snap.tracks).toEqual([]);
  });

  it('falls back to empty strings for missing title/artist', () => {
    playerStore.setState({
      queue: [track('a', { title: undefined as unknown as string, artist: undefined })],
      currentTrackIndex: 0,
      playbackState: 'paused',
    });

    const snap = __test.buildSnapshot();

    expect(snap.tracks[0]).toMatchObject({ title: '', artist: '' });
    expect(snap.isPlaying).toBe(false);
  });
});

describe('syncNowPlayingWidget', () => {
  it('pushes the snapshot on Android', () => {
    playerStore.setState({ queue: [track('a')], currentTrackIndex: 0, playbackState: 'playing' });

    syncNowPlayingWidget();

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ hasSession: true, currentIndex: 0 }));
  });

  it('is a no-op off Android', () => {
    setPlatform('ios');

    syncNowPlayingWidget();

    expect(mockSet).not.toHaveBeenCalled();
  });

  it('swallows native errors', () => {
    mockSet.mockImplementationOnce(() => {
      throw new Error('bridge down');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => syncNowPlayingWidget()).not.toThrow();

    warn.mockRestore();
  });
});

describe('clearNowPlayingWidget', () => {
  it('clears on Android', () => {
    clearNowPlayingWidget();
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('is a no-op off Android', () => {
    setPlatform('ios');
    clearNowPlayingWidget();
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('swallows native errors', () => {
    mockClear.mockImplementationOnce(() => {
      throw new Error('bridge down');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => clearNowPlayingWidget()).not.toThrow();

    warn.mockRestore();
  });
});

describe('initNowPlayingWidget', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    // Tear down the subscription + pending timer while fake timers are still
    // active, then drop any residual fake timers before restoring real ones.
    __test.reset();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('pushes an initial snapshot and re-pushes on relevant changes (debounced)', () => {
    initNowPlayingWidget();
    // initial scheduleSync
    jest.advanceTimersByTime(300);
    expect(mockSet).toHaveBeenCalledTimes(1);

    // a queue change schedules another push
    playerStore.setState({ queue: [track('a')], currentTrackIndex: 0, playbackState: 'playing' });
    jest.advanceTimersByTime(300);
    expect(mockSet).toHaveBeenCalledTimes(2);

    // a pure progress tick does NOT
    playerStore.setState({ position: 5 });
    jest.advanceTimersByTime(300);
    expect(mockSet).toHaveBeenCalledTimes(2);
  });

  it('coalesces a burst of changes into one push', () => {
    initNowPlayingWidget();
    jest.advanceTimersByTime(300); // drain initial
    mockSet.mockClear();

    playerStore.setState({ playbackState: 'playing' });
    playerStore.setState({ currentTrackIndex: 2 });
    playerStore.setState({ queue: [track('a'), track('b'), track('c')] });
    jest.advanceTimersByTime(300);

    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('is idempotent and a no-op off Android', () => {
    setPlatform('ios');
    initNowPlayingWidget();
    jest.advanceTimersByTime(300);
    expect(mockSet).not.toHaveBeenCalled();
  });
});
