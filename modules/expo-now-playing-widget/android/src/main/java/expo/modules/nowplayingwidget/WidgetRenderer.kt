package expo.modules.nowplayingwidget

import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import androidx.core.widget.RemoteViewsCompat

/**
 * Builds the widget's RemoteViews: the now-playing header (art, title, artist,
 * transport controls) and the queue rows. Runs off the main thread (the refresh
 * executor) because it decodes the header bitmap.
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

  /** The queue rows as inline collection items (text only). Item ids are absolute
   *  queue indexes; a row tap carries that index via a fill-in intent merged into
   *  [WidgetControlReceiver.skipTemplate]. */
  fun buildQueueItems(context: Context, snapshot: WidgetSnapshot): RemoteViewsCompat.RemoteCollectionItems {
    val builder = RemoteViewsCompat.RemoteCollectionItems.Builder()
      .setHasStableIds(true)
      .setViewTypeCount(1)
    val accent = context.getColor(R.color.nppw_accent)
    val primary = context.getColor(R.color.nppw_text_primary)

    snapshot.tracks.forEachIndexed { i, track ->
      val isCurrent = i == snapshot.currentIndex
      val absolute = snapshot.offset + i
      val row = RemoteViews(context.packageName, R.layout.nppw_queue_item)
      row.setTextViewText(R.id.nppw_row_title, track.title)
      row.setTextViewText(R.id.nppw_row_artist, track.artist)
      row.setInt(
        R.id.nppw_row_root,
        "setBackgroundResource",
        if (isCurrent) R.drawable.nppw_row_current_bg else 0,
      )
      row.setTextColor(R.id.nppw_row_title, if (isCurrent) accent else primary)
      row.setOnClickFillInIntent(
        R.id.nppw_row_root,
        Intent().putExtra(WidgetControlReceiver.EXTRA_INDEX, absolute),
      )
      builder.addItem(absolute.toLong(), row)
    }
    return builder.build()
  }
}
