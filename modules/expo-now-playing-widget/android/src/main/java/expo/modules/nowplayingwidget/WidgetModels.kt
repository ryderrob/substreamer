package expo.modules.nowplayingwidget

import org.json.JSONArray
import org.json.JSONObject

/** One queue row as the widget renders it. Mirrors the JS `WidgetTrack`. */
data class WidgetTrack(
  val id: String,
  val title: String,
  val artist: String,
  val artUri: String?,
)

/**
 * The full state the widget renders from. Mirrors the JS `WidgetSnapshot`.
 * Produced either by the JS `nowPlayingWidgetService` (app alive) or by
 * [WidgetControlReceiver] reading the live MediaController after a tap (JS dead).
 */
data class WidgetSnapshot(
  val hasSession: Boolean,
  val isPlaying: Boolean,
  /** Index of the current track within [tracks], or -1. */
  val currentIndex: Int,
  val tracks: List<WidgetTrack>,
) {
  fun toJson(): String {
    val arr = JSONArray()
    for (t in tracks) {
      arr.put(
        JSONObject()
          .put("id", t.id)
          .put("title", t.title)
          .put("artist", t.artist)
          .put("artUri", t.artUri ?: JSONObject.NULL),
      )
    }
    return JSONObject()
      .put("hasSession", hasSession)
      .put("isPlaying", isPlaying)
      .put("currentIndex", currentIndex)
      .put("tracks", arr)
      .toString()
  }

  companion object {
    val EMPTY = WidgetSnapshot(hasSession = false, isPlaying = false, currentIndex = -1, tracks = emptyList())

    /** Parse a snapshot JSON string. Returns [EMPTY] on malformed input. */
    fun fromJson(json: String): WidgetSnapshot {
      return try {
        val obj = JSONObject(json)
        val arr = obj.optJSONArray("tracks") ?: JSONArray()
        val tracks = ArrayList<WidgetTrack>(arr.length())
        for (i in 0 until arr.length()) {
          val t = arr.getJSONObject(i)
          tracks.add(
            WidgetTrack(
              id = t.optString("id"),
              title = t.optString("title"),
              artist = t.optString("artist"),
              artUri = if (t.isNull("artUri")) null else t.optString("artUri").ifEmpty { null },
            ),
          )
        }
        WidgetSnapshot(
          hasSession = obj.optBoolean("hasSession", tracks.isNotEmpty()),
          isPlaying = obj.optBoolean("isPlaying", false),
          currentIndex = obj.optInt("currentIndex", -1),
          tracks = tracks,
        )
      } catch (_: Throwable) {
        EMPTY
      }
    }
  }
}
