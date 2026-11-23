/**
 * Android widget cold-start play. After the process was killed, a widget play / row tap
 * saves a resume request and wakes the app's JS headlessly; this consumes it and restores
 * the saved queue and plays it. Ignored when the UI launched (the user sees the app).
 */
import { AppState, Platform } from 'react-native';
import { consumeWidgetResumeRequest } from 'expo-now-playing-widget';

import { errMessage } from '../utils/errorMessage';
import { ensureHeadlessDataReady } from './headlessMediaService';
import { resumeFromWidget } from './playerService';

/** A request older than this is a stale tap, not a user waiting for sound. */
const MAX_REQUEST_AGE_MS = 30_000;

export async function maybeResumeFromWidget(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // Always consume so a request never lingers for a later launch.
    const request = consumeWidgetResumeRequest();
    if (!request) return;
    if (Date.now() - request.requestedAt > MAX_REQUEST_AGE_MS) return;
    if (AppState.currentState === 'active') return;

    await ensureHeadlessDataReady();
    await resumeFromWidget(request);
  } catch (e) {
    // Best-effort: a failed resume leaves the widget as it was; nothing to surface headless.
    console.warn('[widgetResume] resume failed:', errMessage(e));
  }
}
