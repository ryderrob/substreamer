import { requireNativeModule } from 'expo-modules-core';

export interface ExpoNowPlayingWidgetNativeModule {
  /** Persist the serialized snapshot and refresh every widget instance. */
  setSnapshot: (json: string) => void;
  /** Reset the widget(s) to the empty state. */
  clear: () => void;
  /** Return and remove the pending widget resume request (JSON), or null when none. */
  consumeResumeRequest: () => string | null;
}

let module: ExpoNowPlayingWidgetNativeModule;

try {
  module = requireNativeModule('ExpoNowPlayingWidget');
} catch {
  // Android-only native module. iOS, a build without the native side, and Jest all get a
  // no-op so callers never have to branch on platform/availability.
  module = {
    setSnapshot: () => {},
    clear: () => {},
    consumeResumeRequest: () => null,
  };
}

export default module;
