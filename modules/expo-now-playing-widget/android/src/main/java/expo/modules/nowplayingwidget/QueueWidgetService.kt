package expo.modules.nowplayingwidget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/** Serves the scrollable queue ListView its rows from the stored snapshot. */
class QueueWidgetService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
    QueueRemoteViewsFactory(applicationContext)
}

/**
 * Backs the queue ListView. Reads the persisted [WidgetSnapshot] (plain data, no
 * MediaController) on the binder thread, so no Looper/threading constraints apply
 * here. Row taps carry the absolute queue index via a fill-in intent merged into
 * [WidgetControlReceiver.skipTemplate].
 */
class QueueRemoteViewsFactory(context: Context) : RemoteViewsService.RemoteViewsFactory {
  private val appContext = context.applicationContext
  private var snapshot = WidgetSnapshot.EMPTY

  override fun onCreate() {
    snapshot = WidgetSnapshotStore.load(appContext)
  }

  override fun onDataSetChanged() {
    snapshot = WidgetSnapshotStore.load(appContext)
  }

  override fun onDestroy() {}

  override fun getCount(): Int = snapshot.tracks.size

  override fun getViewAt(position: Int): RemoteViews {
    val views = RemoteViews(appContext.packageName, R.layout.nppw_queue_item)
    val track = snapshot.tracks.getOrNull(position) ?: return views
    val isCurrent = position == snapshot.currentIndex

    views.setTextViewText(R.id.nppw_row_title, track.title)
    views.setTextViewText(R.id.nppw_row_artist, track.artist)

    val bitmap = ArtworkLoader.load(appContext, track.artUri, ROW_ART_PX)
    if (bitmap != null) {
      views.setImageViewBitmap(R.id.nppw_row_art, bitmap)
    } else {
      views.setImageViewResource(R.id.nppw_row_art, R.drawable.nppw_placeholder)
    }

    views.setInt(
      R.id.nppw_row_root,
      "setBackgroundResource",
      if (isCurrent) R.drawable.nppw_row_current_bg else 0,
    )
    views.setTextColor(
      R.id.nppw_row_title,
      appContext.getColor(if (isCurrent) R.color.nppw_accent else R.color.nppw_text_primary),
    )

    val fillIn = Intent().putExtra(WidgetControlReceiver.EXTRA_INDEX, snapshot.offset + position)
    views.setOnClickFillInIntent(R.id.nppw_row_root, fillIn)
    return views
  }

  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount(): Int = 1
  override fun getItemId(position: Int): Long = position.toLong()

  /** Stable ids let the host reuse existing row views and rebind them in place on
   *  a reload (e.g. when the highlighted track moves) instead of tearing the list
   *  down and rebuilding it — which removes the flicker on track change. Positions
   *  are unique, and the queue is identical across a highlight-only reload, so the
   *  position doubles as a stable identity for that transition. */
  override fun hasStableIds(): Boolean = true

  private companion object {
    const val ROW_ART_PX = 120
  }
}
