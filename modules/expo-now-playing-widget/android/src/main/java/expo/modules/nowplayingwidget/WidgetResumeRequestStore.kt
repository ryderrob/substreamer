package expo.modules.nowplayingwidget

import android.content.Context
import org.json.JSONObject

/**
 * One pending "play the saved queue" request from the widget, left for the app's
 * headless JS to pick up after the process was killed. Consumed exactly once.
 */
object WidgetResumeRequestStore {
  private const val PREFS = "expo_now_playing_widget"
  private const val KEY_RESUME = "resume_request"

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** [kind] is "play" or "skip"; [index] is the absolute queue index for "skip". */
  fun save(context: Context, kind: String, index: Int?) {
    val json = JSONObject()
      .put("kind", kind)
      .put("index", index ?: JSONObject.NULL)
      .put("requestedAt", System.currentTimeMillis())
    prefs(context).edit().putString(KEY_RESUME, json.toString()).apply()
  }

  /** Returns the stored request JSON and removes it, or null when none is pending. */
  @Synchronized
  fun consumeJson(context: Context): String? {
    val prefs = prefs(context)
    val json = prefs.getString(KEY_RESUME, null) ?: return null
    prefs.edit().remove(KEY_RESUME).apply()
    return json
  }
}
