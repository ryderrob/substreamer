package expo.modules.nowplayingwidget

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS bridge for the Android now-playing widget. The app pushes a serialized
 * [WidgetSnapshot] on every relevant player-state change; this persists it and
 * refreshes every widget instance. No-op if there is no React context.
 */
class ExpoNowPlayingWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoNowPlayingWidget")

    Function("setSnapshot") { json: String ->
      val context = appContext.reactContext?.applicationContext
      if (context != null) {
        WidgetSnapshotStore.save(context, WidgetSnapshot.fromJson(json))
        NowPlayingWidgetProvider.refreshAll(context)
      }
    }

    Function("consumeResumeRequest") {
      val context = appContext.reactContext?.applicationContext
      if (context != null) WidgetResumeRequestStore.consumeJson(context) else null
    }

    Function("clear") {
      val context = appContext.reactContext?.applicationContext
      if (context != null) {
        WidgetSnapshotStore.clear(context)
        NowPlayingWidgetProvider.refreshAll(context)
      }
    }
  }
}
