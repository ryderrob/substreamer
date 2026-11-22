/**
 * Feeds the Android home-screen now-playing widget a snapshot of the current
 * queue + playback state, rebuilt from `playerStore` whenever the queue, the
 * active index, or the play/pause state changes.
 *
 * The widget itself is native (Media3 `MediaController` bound to RNQP's
 * `PlaybackService` for transport; the queue rows travel inline in each widget
 * update). This service only PUBLISHES state; it issues no commands. Artwork is
 * the plain cover-art URL (`getCoverArtUrl`, a synchronous query-string builder),
 * so publishing costs no IO here; the native side fetches + caches the header
 * bitmap. Android-only; a no-op elsewhere (the native
 * module resolves to a no-op off Android too, but the Platform guard avoids the
 * wasted snapshot build).
 */
import { Platform } from 'react-native';

import { setWidgetSnapshot, clearWidget, type WidgetSnapshot, type WidgetTrack } from 'expo-now-playing-widget';
import { playerStore } from '../store/playerStore';
import { getCoverArtUrl } from './subsonicService';

/** Cap rows pushed to the widget — bounds the bridge payload + stored blob for
 *  pathological queues. Longer queues are sent as a window of MAX_ROWS rows
 *  around the current track; `offset` maps rows back to absolute queue indexes.
 *  The window rule must stay identical to `WidgetWindow` in WidgetModels.kt. */
const MAX_ROWS = 100;
/** Rows kept before the current track when the queue is windowed. */
const WINDOW_LEAD = MAX_ROWS / 2;
/** Cover-art request size (px) for the widget's header image. */
const ART_SIZE = 160;

let initialized = false;
let scheduled = false;
let unsubscribe: (() => void) | null = null;

function buildSnapshot(): WidgetSnapshot {
  const { queue, currentTrackIndex, playbackState } = playerStore.getState();
  const hasCurrent =
    currentTrackIndex != null && currentTrackIndex >= 0 && currentTrackIndex < queue.length;
  const start = hasCurrent
    ? Math.min(Math.max(currentTrackIndex - WINDOW_LEAD, 0), Math.max(0, queue.length - MAX_ROWS))
    : 0;
  const tracks: WidgetTrack[] = queue.slice(start, start + MAX_ROWS).map((c) => ({
    id: c.id,
    title: c.title ?? '',
    artist: c.artist ?? '',
    artUri: c.coverArt ? getCoverArtUrl(c.coverArt, ART_SIZE) : null,
  }));
  return {
    hasSession: tracks.length > 0,
    isPlaying: playbackState === 'playing',
    currentIndex: hasCurrent ? currentTrackIndex - start : -1,
    offset: start,
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

/** Coalesce bursts of player-state writes into one push. A microtask, not a timer:
 *  React Native pauses JS timers while the app is in the background. */
function scheduleSync(): void {
  if (scheduled) return;
  scheduled = true;
  Promise.resolve().then(() => {
    scheduled = false;
    syncNowPlayingWidget();
  });
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
    scheduled = false;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  },
};
