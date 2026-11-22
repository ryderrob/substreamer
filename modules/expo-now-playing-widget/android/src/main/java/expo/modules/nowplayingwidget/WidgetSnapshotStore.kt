package expo.modules.nowplayingwidget

import android.content.Context

/**
 * Persists the latest [WidgetSnapshot] to SharedPreferences so the widget still
 * renders the last known state after the app process is killed.
 * [NowPlayingWidgetProvider] renders from here; the JS
 * bridge and [WidgetControlReceiver] write to it.
 */
object WidgetSnapshotStore {
  private const val PREFS = "expo_now_playing_widget"
  private const val KEY_SNAPSHOT = "snapshot"

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(context: Context, snapshot: WidgetSnapshot) {
    prefs(context).edit().putString(KEY_SNAPSHOT, snapshot.toJson()).apply()
  }

  fun load(context: Context): WidgetSnapshot {
    val json = prefs(context).getString(KEY_SNAPSHOT, null) ?: return WidgetSnapshot.EMPTY
    return WidgetSnapshot.fromJson(json)
  }

  fun clear(context: Context) {
    prefs(context).edit().remove(KEY_SNAPSHOT).apply()
  }
}
