import ExpoNowPlayingWidget from './ExpoNowPlayingWidgetModule';

/** One row of the queue as the widget renders it. */
export interface WidgetTrack {
  id: string;
  title: string;
  artist: string;
  /** Cover-art URI (http(s) / file / content) for the row, or null for the placeholder. */
  artUri: string | null;
}

/** The full state the Android home-screen widget renders from. */
export interface WidgetSnapshot {
  /** True when a queue is loaded — controls + list render; false shows the empty state. */
  hasSession: boolean;
  isPlaying: boolean;
  /** Index of the current track within `tracks`, or -1 when nothing is active. */
  currentIndex: number;
  /** Absolute queue index of `tracks[0]` (the snapshot holds a window of the queue). */
  offset: number;
  tracks: WidgetTrack[];
}

/**
 * Push the current player snapshot to the Android home-screen widget. No-op off Android
 * (the native module resolves to a no-op there). The snapshot is persisted natively so a
 * killed process still renders the last state.
 */
export function setWidgetSnapshot(snapshot: WidgetSnapshot): void {
  ExpoNowPlayingWidget.setSnapshot(JSON.stringify(snapshot));
}

/** Reset the widget to its empty state (queue cleared / logout). No-op off Android. */
export function clearWidget(): void {
  ExpoNowPlayingWidget.clear();
}
