package expo.modules.nowplayingwidget

import android.content.Context
import android.view.View
import android.widget.RemoteViews

/**
 * Builds the widget's root RemoteViews: the now-playing header (art, title,
 * artist, transport controls) over the queue ListView. Runs off the main thread
 * (the refresh executor) because it decodes the header bitmap.
 */
object WidgetRenderer {
  private const val HEADER_ART_PX = 200

  fun buildRootViews(context: Context, snapshot: WidgetSnapshot): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.nppw_widget)
    val current = snapshot.tracks.getOrNull(snapshot.currentIndex)

    if (current != null) {
      views.setTextViewText(R.id.nppw_title, current.title)
      views.setTextViewText(R.id.nppw_artist, current.artist)
      views.setViewVisibility(R.id.nppw_artist, View.VISIBLE)
      val bitmap = ArtworkLoader.load(context, current.artUri, HEADER_ART_PX)
      if (bitmap != null) {
        views.setImageViewBitmap(R.id.nppw_art, bitmap)
      } else {
        views.setImageViewResource(R.id.nppw_art, R.drawable.nppw_placeholder)
      }
    } else {
      views.setTextViewText(R.id.nppw_title, context.getString(R.string.nppw_empty_title))
      views.setViewVisibility(R.id.nppw_artist, View.GONE)
      views.setImageViewResource(R.id.nppw_art, R.drawable.nppw_placeholder)
    }

    views.setImageViewResource(
      R.id.nppw_playpause,
      if (snapshot.isPlaying) R.drawable.nppw_ic_pause else R.drawable.nppw_ic_play,
    )

    // Tapping the cover art opens the app on the full-screen player (current song).
    views.setOnClickPendingIntent(R.id.nppw_art, WidgetControlReceiver.openPlayer(context))

    views.setOnClickPendingIntent(R.id.nppw_prev, WidgetControlReceiver.pending(context, WidgetControlReceiver.ACTION_PREV))
    views.setOnClickPendingIntent(R.id.nppw_playpause, WidgetControlReceiver.pending(context, WidgetControlReceiver.ACTION_PLAY_PAUSE))
    views.setOnClickPendingIntent(R.id.nppw_next, WidgetControlReceiver.pending(context, WidgetControlReceiver.ACTION_NEXT))

    return views
  }
}
