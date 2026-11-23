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

/** A play / row-tap the widget left for the app when the player process was dead. */
export interface WidgetResumeRequest {
  kind: 'play' | 'skip';
  /** Absolute queue index for `skip`, otherwise null. */
  index: number | null;
  /** Epoch ms the widget saved the request. */
  requestedAt: number;
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

/**
 * Return and clear the pending widget resume request, or null when there is none or it is
 * malformed. No-op (null) off Android.
 */
export function consumeWidgetResumeRequest(): WidgetResumeRequest | null {
  const json = ExpoNowPlayingWidget.consumeResumeRequest();
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<WidgetResumeRequest> | null;
    if (!parsed || (parsed.kind !== 'play' && parsed.kind !== 'skip')) return null;
    if (typeof parsed.requestedAt !== 'number') return null;
    const index = typeof parsed.index === 'number' ? parsed.index : null;
    if (parsed.kind === 'skip' && index === null) return null;
    return { kind: parsed.kind, index, requestedAt: parsed.requestedAt };
  } catch {
    // Malformed payload: treat as no request.
    return null;
  }
}
