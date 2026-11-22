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
  // Dispose the store subscription so nothing fires after the Jest environment
  // is torn down.
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
      offset: 0,
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
    expect(snap.offset).toBe(0);
    expect(snap.tracks).toEqual([]);
  });

  describe('queue window', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => track(`t${i}`));
    const build = (n: number, current: number | null) => {
      const queue = many(n);
      playerStore.setState({ queue, currentTrackIndex: current, playbackState: 'playing' });
      return { queue, snap: __test.buildSnapshot() };
    };

    it('keeps a queue of exactly 100 whole', () => {
      const { snap } = build(100, 99);
      expect(snap.offset).toBe(0);
      expect(snap.currentIndex).toBe(99);
      expect(snap.tracks).toHaveLength(100);
    });

    it('starts at 0 when the current track is near the head of a long queue', () => {
      const { snap } = build(1000, 0);
      expect(snap.offset).toBe(0);
      expect(snap.currentIndex).toBe(0);
      expect(snap.tracks).toHaveLength(100);
    });

    it('centres the window on a deep current track', () => {
      const { queue, snap } = build(1000, 600);
      expect(snap.offset).toBe(550);
      expect(snap.currentIndex).toBe(50);
      expect(snap.tracks[50].id).toBe(queue[600].id);
      expect(snap.tracks).toHaveLength(100);
    });

    it('clamps the window to the queue tail', () => {
      const { queue, snap } = build(1000, 990);
      expect(snap.offset).toBe(900);
      expect(snap.currentIndex).toBe(90);
      expect(snap.tracks[90].id).toBe(queue[990].id);
      expect(snap.tracks).toHaveLength(100);
    });

    it('uses offset 0 and currentIndex -1 with no current track', () => {
      const { snap } = build(1000, null);
      expect(snap.offset).toBe(0);
      expect(snap.currentIndex).toBe(-1);
      expect(snap.tracks).toHaveLength(100);
    });
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
  const flushMicrotasks = async () => {
    for (let i = 0; i < 3; i++) await Promise.resolve();
  };

  it('pushes an initial snapshot and re-pushes on relevant changes', async () => {
    initNowPlayingWidget();
    await flushMicrotasks();
    expect(mockSet).toHaveBeenCalledTimes(1);

    playerStore.setState({ queue: [track('a')], currentTrackIndex: 0, playbackState: 'playing' });
    await flushMicrotasks();
    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenLastCalledWith(expect.objectContaining({ hasSession: true, isPlaying: true }));
  });

  it('does not push on a pure progress tick', async () => {
    initNowPlayingWidget();
    await flushMicrotasks();
    mockSet.mockClear();

    playerStore.setState({ position: 5 });
    await flushMicrotasks();

    expect(mockSet).not.toHaveBeenCalled();
  });

  it('coalesces a synchronous burst of changes into one push', async () => {
    initNowPlayingWidget();
    await flushMicrotasks();
    mockSet.mockClear();

    playerStore.setState({ playbackState: 'playing' });
    playerStore.setState({ currentTrackIndex: 2 });
    playerStore.setState({ queue: [track('a'), track('b'), track('c')] });
    await flushMicrotasks();

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ currentIndex: 2, isPlaying: true }));
  });

  it('is a no-op off Android', async () => {
    setPlatform('ios');
    initNowPlayingWidget();
    playerStore.setState({ queue: [track('a')] });
    await flushMicrotasks();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('publishes without any timer advancing (timers are paused in the background)', async () => {
    jest.useFakeTimers();
    try {
      initNowPlayingWidget();
      await flushMicrotasks();
      expect(mockSet).toHaveBeenCalledTimes(1);

      playerStore.setState({ queue: [track('a')], currentTrackIndex: 0, playbackState: 'playing' });
      await flushMicrotasks();
      expect(mockSet).toHaveBeenCalledTimes(2);
    } finally {
      __test.reset();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
