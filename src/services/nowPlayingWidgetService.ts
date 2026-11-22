/**
 * Feeds the Android home-screen now-playing widget a snapshot of the current
 * queue + playback state, rebuilt from `playerStore` whenever the queue, the
 * active index, or the play/pause state changes.
 *
 * The widget itself is native (Media3 `MediaController` bound to RNQP's
 * `PlaybackService` for transport; a `RemoteViewsService` list for the queue).
 * This service only PUBLISHES state; it issues no commands. Row artwork is the
 * plain cover-art URL (`getCoverArtUrl`, a synchronous query-string builder) so
 * even a large queue costs no IO here — the native side fetches + caches the
 * bitmap lazily per visible row. Android-only; a no-op elsewhere (the native
 * module resolves to a no-op off Android too, but the Platform guard avoids the
 * wasted snapshot build).
 */
import { Platform } from 'react-native';

import { setWidgetSnapshot, clearWidget, type WidgetSnapshot, type WidgetTrack } from 'expo-now-playing-widget';
import { playerStore } from '../store/playerStore';
import { getCoverArtUrl } from './subsonicService';

/** Cap rows pushed to the widget — bounds the bridge payload + stored blob for
 *  pathological queues. A home-screen list never needs more, and tap-to-jump
 *  indexes from the queue start so the cap only ever drops the deep tail. */
const MAX_ROWS = 500;
/** Row cover-art request size (px) — small; the widget thumbnail is ~40dp. */
const ART_SIZE = 160;
const DEBOUNCE_MS = 300;

let initialized = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

function buildSnapshot(): WidgetSnapshot {
  const { queue, currentTrackIndex, playbackState } = playerStore.getState();
  const tracks: WidgetTrack[] = queue.slice(0, MAX_ROWS).map((c) => ({
    id: c.id,
    title: c.title ?? '',
    artist: c.artist ?? '',
    artUri: c.coverArt ? getCoverArtUrl(c.coverArt, ART_SIZE) : null,
  }));
  return {
    hasSession: tracks.length > 0,
    isPlaying: playbackState === 'playing',
    currentIndex:
      currentTrackIndex != null && currentTrackIndex >= 0 && currentTrackIndex < tracks.length
        ? currentTrackIndex
        : -1,
    tracks,
  };
}

/** Build + push the current snapshot now. No-op off Android. */
export function syncNowPlayingWidget(): void {
  if (Platform.OS !== 'android') return;
  try {
    setWidgetSnapshot(buildSnapshot());
  } catch (e) {
    console.warn('[nowPlayingWidget] sync failed:', e);
  }
}

/** Coalesce bursts of player-state writes into one push. */
function scheduleSync(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    syncNowPlayingWidget();
  }, DEBOUNCE_MS);
}

/** Reset the widget to its empty state (queue cleared / logout). No-op off Android. */
export function clearNowPlayingWidget(): void {
  if (Platform.OS !== 'android') return;
  try {
    clearWidget();
  } catch (e) {
    console.warn('[nowPlayingWidget] clear failed:', e);
  }
}

/**
 * Subscribe to the player store so the widget tracks the live queue + state.
 * Idempotent; Android-only. Called from `initPlayer()` (UI boot + headless), so
 * it is armed on every launch path. Ignores pure progress ticks — only queue
 * identity, active index, and play state move the widget.
 */
export function initNowPlayingWidget(): void {
  if (initialized || Platform.OS !== 'android') return;
  initialized = true;
  unsubscribe = playerStore.subscribe((state, prev) => {
    if (
      state.queue !== prev.queue ||
      state.currentTrackIndex !== prev.currentTrackIndex ||
      state.playbackState !== prev.playbackState
    ) {
      scheduleSync();
    }
  });
  // Initial push so a cold launch with a restored queue renders immediately.
  scheduleSync();
}

/** Internals exposed for unit tests. */
export const __test = {
  buildSnapshot,
  reset: () => {
    initialized = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  },
};
